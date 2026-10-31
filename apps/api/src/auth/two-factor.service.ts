import type {
  TwoFactorEnabled,
  TwoFactorSetup,
  TwoFactorStatus,
  User,
} from '@dossierhq/contracts';
import type { DatabaseAdapter, MfaRecord } from '@dossierhq/database';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditLog } from '../audit/audit-log.js';
import { DATABASE } from '../database/database.module.js';
import { EventBus } from '../events/event-bus.js';
import { Secrets } from '../integrations/secrets.js';
import { RateLimits } from './rate-limits.js';
import {
  hashRecoveryCode,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  totpUri,
} from './totp.js';

/** How long someone has, after their password, to enter their code. */
const CHALLENGE_MINUTES = 5;

const WRONG_CODE =
  'That code didn’t match. Use the newest code from your app, or a recovery code.';

const sealedSecretSchema = z.object({ totp: z.string() });
const challengeSchema = z.object({
  kind: z.literal('two-factor'),
  userId: z.string(),
  expiresAt: z.number(),
});

export type CodeUsed = 'code' | 'recovery';

/**
 * Two-factor sign-in with an authenticator app. The secret is sealed with
 * CONNECTOR_SECRET_KEY; recovery codes are kept only as hashes. Each code
 * works once, and wrong codes count against the person's rate limit.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly secrets: Secrets,
    private readonly audit: AuditLog,
    private readonly events: EventBus,
    private readonly limits: RateLimits,
  ) {}

  /** False until the API has CONNECTOR_SECRET_KEY, which seals the secret. */
  get available(): boolean {
    return this.secrets.available;
  }

  async isOn(userId: string): Promise<boolean> {
    return Boolean((await this.db.mfa.get(userId))?.enabledAt);
  }

  async status(userId: string): Promise<TwoFactorStatus> {
    const [record, setup] = await Promise.all([
      this.db.mfa.get(userId),
      this.db.users.setup(userId),
    ]);
    const enabled = Boolean(record?.enabledAt);
    return {
      available: this.secrets.available,
      enabled,
      required: setup?.twoFactorRequired ?? false,
      recoveryCodesLeft: enabled ? record!.recoveryHashes.length : 0,
    };
  }

  /** A new secret to add to the app; on only once a code from it checks out. */
  async setup(user: User): Promise<TwoFactorSetup> {
    this.requireKey();
    const secret = newTotpSecret();
    const sealed = this.secrets.encrypt({ totp: secret });
    if (!(await this.db.mfa.begin(user.id, sealed, new Date().toISOString()))) {
      throw new ConflictException(
        'Two-factor sign-in is already on. Turn it off first to set it up again.',
      );
    }
    return { secret, uri: totpUri(secret, user.email) };
  }

  /** Checks a code from the new setup, turns it on, and hands out recovery codes. */
  async enable(
    user: User,
    workspaceId: string,
    code: string,
    ip: string | null,
  ): Promise<TwoFactorEnabled> {
    const record = await this.db.mfa.get(user.id);
    if (!record || record.enabledAt) {
      throw new BadRequestException(
        'Start setting up two-factor sign-in first.',
      );
    }
    await this.refuseWhenLimited(user.id);
    const step = matchTotp(
      this.secretOf(record) ?? '',
      code.replace(/\s/g, ''),
    );
    if (step === null) {
      await this.limits.hit(['two-factor-user', user.id]);
      throw new BadRequestException(WRONG_CODE);
    }
    const recoveryCodes = newRecoveryCodes();
    await this.db.mfa.enable(
      user.id,
      recoveryCodes.map(hashRecoveryCode),
      new Date().toISOString(),
    );
    await this.db.mfa.useStep(user.id, step);
    await this.audit.record(workspaceId, user, {
      kind: 'sign-in',
      what: 'Turned on two-factor sign-in',
      ip,
    });
    return { recoveryCodes };
  }

  /** Needs a current code (or a recovery code), so a stolen session can't. */
  async disable(
    user: User,
    workspaceId: string,
    code: string,
    ip: string | null,
  ): Promise<void> {
    if (!(await this.check(user.id, code))) {
      throw new BadRequestException(WRONG_CODE);
    }
    await this.db.mfa.remove(user.id);
    await this.audit.record(workspaceId, user, {
      kind: 'sign-in',
      what: 'Turned off two-factor sign-in',
      ip,
    });
    await this.events.publish(workspaceId, user.id, {
      type: 'security.two-factor-off',
      userId: user.id,
    });
  }

  /**
   * Which kind of code matched, using it up, or null. 429 once someone has
   * got it wrong too often; each wrong one counts.
   */
  async check(userId: string, code: string): Promise<CodeUsed | null> {
    await this.refuseWhenLimited(userId);
    const record = await this.db.mfa.get(userId);
    if (!record?.enabledAt) return null;
    const digits = code.replace(/\s/g, '');
    let used: CodeUsed | null = null;
    if (/^\d{6}$/.test(digits)) {
      const step = matchTotp(this.secretOf(record) ?? '', digits);
      if (step !== null && (await this.db.mfa.useStep(userId, step))) {
        used = 'code';
      }
    } else if (
      await this.db.mfa.useRecoveryCode(userId, hashRecoveryCode(code))
    ) {
      used = 'recovery';
    }
    if (!used) await this.limits.hit(['two-factor-user', userId]);
    return used;
  }

  async recoveryCodesLeft(userId: string): Promise<number> {
    return (await this.db.mfa.get(userId))?.recoveryHashes.length ?? 0;
  }

  /** Sealed, so it can't be forged, and short-lived. */
  challenge(userId: string): string {
    this.requireKey();
    return this.secrets.encrypt({
      kind: 'two-factor',
      userId,
      expiresAt: Date.now() + CHALLENGE_MINUTES * 60_000,
    });
  }

  /** The user a challenge is for, or null if it's forged or stale. */
  openChallenge(challenge: string): string | null {
    try {
      const opened = challengeSchema.parse(this.secrets.decrypt(challenge));
      return opened.expiresAt > Date.now() ? opened.userId : null;
    } catch {
      return null;
    }
  }

  private async refuseWhenLimited(userId: string) {
    if (await this.limits.blocked(['two-factor-user', userId])) {
      throw new HttpException(
        'Too many wrong codes. Wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** The plain secret, or null without the key (recovery codes still work). */
  private secretOf(record: MfaRecord): string | null {
    if (!this.secrets.available) return null;
    try {
      return sealedSecretSchema.parse(this.secrets.decrypt(record.secret)).totp;
    } catch {
      return null;
    }
  }

  private requireKey() {
    if (!this.secrets.available) {
      throw new ServiceUnavailableException(
        'Two-factor sign-in needs CONNECTOR_SECRET_KEY on the API.',
      );
    }
  }
}
