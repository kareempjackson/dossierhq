import type {
  SignInRequest,
  StaffChallenge,
  StaffInviteAccept,
  StaffInviteAccepted,
  StaffInvitePreview,
  StaffMe,
  StaffSession,
  StaffTwoFactorSetup,
  TwoFactorSignIn,
} from '@dossierhq/contracts';
import type { DatabaseAdapter, StaffRecord } from '@dossierhq/database';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashToken } from '../auth/token-hash.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { RateLimits } from '../auth/rate-limits.js';
import {
  hashRecoveryCode,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  totpUri,
} from '../auth/totp.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { Secrets } from '../integrations/secrets.js';
import { StaffAudit } from './staff-audit.js';

/** How long someone has, after their password, to enter their code. */
const CHALLENGE_MINUTES = 5;
/** How long someone accepting an invite has to add the app and enter a code. */
const SETUP_MINUTES = 30;
/** How often a session's last use is written: often enough for idle timeouts. */
const TOUCH_EVERY_MS = 60_000;
/** How often ended sessions are deleted. */
const SWEEP_EVERY_MS = 60 * 60_000;

const WRONG_CODE =
  'That code didn’t match. Use the newest code from your app, or a recovery code.';

const challengeSchema = z.object({
  kind: z.literal('staff-two-factor'),
  staffId: z.string(),
  expiresAt: z.number(),
});
const setupSchema = z.object({
  kind: z.literal('staff-setup'),
  inviteId: z.string(),
  totp: z.string(),
  expiresAt: z.number(),
});
const sealedTotpSchema = z.object({ totp: z.string() });

const unusableInvite = () =>
  new BadRequestException(
    'This invite has expired, was withdrawn, or was already used. Ask for a new one.',
  );

/**
 * Staff sign-in, apart from workspaces': own accounts and sessions, and two-
 * factor is always on, set up while accepting the invite. Sessions are short
 * (STAFF_SESSION_HOURS, and STAFF_IDLE_MINUTES unused). Everything runs on
 * real time, never the pinned test clock.
 */
@Injectable()
export class StaffAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaffAuthService.name);
  private readonly sessionHours: number;
  private readonly idleMinutes: number;
  private sweeper: NodeJS.Timeout | undefined;
  /** Compared against when the email is unknown, so timing doesn't reveal it. */
  private readonly dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly secrets: Secrets,
    private readonly limits: RateLimits,
    private readonly log: StaffAudit,
    config: ConfigService<AppConfig, true>,
  ) {
    this.sessionHours = config.get('STAFF_SESSION_HOURS', { infer: true });
    this.idleMinutes = config.get('STAFF_IDLE_MINUTES', { infer: true });
  }

  onModuleInit() {
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  private async sweep() {
    try {
      await this.db.staffSessions.deleteEnded(
        new Date().toISOString(),
        this.unusedSince(Date.now()),
      );
    } catch (error) {
      this.logger.warn(
        `Couldn’t delete ended staff sessions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private unusedSince(now: number): string {
    return new Date(now - this.idleMinutes * 60_000).toISOString();
  }

  /**
   * Checks the password and answers with a challenge for the code: staff
   * always sign in with two-factor. 401 for a wrong password or a disabled
   * account, alike; 429 after too many.
   */
  async signIn(
    { email, password }: SignInRequest,
    ip: string | null,
  ): Promise<StaffChallenge> {
    this.requireKey();
    if (
      await this.limits.blocked(
        ['staff-sign-in-email', email],
        ['staff-sign-in-ip', ip],
      )
    ) {
      throw new HttpException(
        'Too many sign-in attempts. Wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const staff = await this.db.staff.findByEmail(email);
    const valid = await verifyPassword(
      password,
      staff?.passwordHash ?? (await this.dummyHash),
    );
    if (!staff || !valid || staff.disabledAt) {
      await this.limits.hit(
        ['staff-sign-in-email', email],
        ['staff-sign-in-ip', ip],
      );
      if (staff) {
        await this.log.record(staff, {
          what: staff.disabledAt
            ? 'Sign-in refused: access was taken away'
            : 'Sign-in failed: wrong password',
          outcome: 'failed',
          ip,
        });
      }
      throw new UnauthorizedException('Email or password is incorrect');
    }
    await this.limits.clear('staff-sign-in-email', email);
    return {
      challenge: this.secrets.encrypt({
        kind: 'staff-two-factor',
        staffId: staff.id,
        expiresAt: Date.now() + CHALLENGE_MINUTES * 60_000,
      }),
    };
  }

  /**
   * Finishes signing in with a code from the app or a recovery code. 400
   * when the challenge is stale; 401 when the code is wrong; 429 after too
   * many wrong ones.
   */
  async completeTwoFactor(
    { challenge, code }: TwoFactorSignIn,
    ip: string | null,
  ): Promise<StaffSession> {
    const staffId = this.openChallenge(challenge);
    const staff = staffId ? await this.db.staff.get(staffId) : null;
    if (!staff || staff.disabledAt) {
      throw new BadRequestException(
        'That sign-in took too long. Sign in again.',
      );
    }
    if (await this.limits.blocked(['staff-two-factor', staff.id])) {
      throw new HttpException(
        'Too many wrong codes. Wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const used = await this.check(staff, code);
    if (!used) {
      await this.limits.hit(['staff-two-factor', staff.id]);
      await this.log.record(staff, {
        what: 'Sign-in failed: two-factor code didn’t match',
        outcome: 'failed',
        ip,
      });
      throw new UnauthorizedException(WRONG_CODE);
    }
    const left =
      used === 'recovery' ? staff.recoveryHashes.length - 1 : undefined;
    await this.log.record(staff, {
      what:
        left === undefined
          ? 'Signed in'
          : `Signed in with a recovery code (${left} left)`,
      ip,
    });
    return this.startSession(staff.id);
  }

  /** Which kind of code matched, using it up, or null. */
  private async check(
    staff: StaffRecord,
    code: string,
  ): Promise<'code' | 'recovery' | null> {
    const digits = code.replace(/\s/g, '');
    if (/^\d{6}$/.test(digits)) {
      const step = matchTotp(this.totpOf(staff), digits);
      return step !== null && (await this.db.staff.useStep(staff.id, step))
        ? 'code'
        : null;
    }
    return (await this.db.staff.useRecoveryCode(
      staff.id,
      hashRecoveryCode(code),
    ))
      ? 'recovery'
      : null;
  }

  /**
   * The live member of staff for a session token, or null when the session
   * is unknown, expired, idle, or their access was taken away. Notes its use.
   */
  async authenticate(token: string): Promise<StaffRecord | null> {
    const tokenHash = hashToken(token);
    const session = await this.db.staffSessions.find(tokenHash);
    if (!session) return null;
    const now = Date.now();
    const at = new Date(now).toISOString();
    if (session.expiresAt <= at || session.lastSeenAt < this.unusedSince(now)) {
      await this.db.staffSessions.delete(tokenHash);
      return null;
    }
    const staff = await this.db.staff.get(session.staffId);
    if (!staff || staff.disabledAt) {
      await this.db.staffSessions.delete(tokenHash);
      return null;
    }
    if (now - Date.parse(session.lastSeenAt) >= TOUCH_EVERY_MS) {
      await this.db.staffSessions.touch(tokenHash, at);
    }
    return staff;
  }

  async signOut(token: string, staffId: string, ip: string | null) {
    await this.db.staffSessions.delete(hashToken(token));
    const staff = await this.db.staff.get(staffId);
    if (staff) await this.log.record(staff, { what: 'Signed out', ip });
  }

  async me(staffId: string): Promise<StaffMe> {
    const staff = await this.db.staff.get(staffId);
    if (!staff) throw new UnauthorizedException('Sign in to continue');
    return {
      staff: publicStaff(staff),
      recoveryCodesLeft: staff.recoveryHashes.length,
    };
  }

  // Invites -------------------------------------------------------------------

  async previewInvite(token: string): Promise<StaffInvitePreview> {
    const invite = await this.usableInvite(token);
    return {
      email: invite.email,
      role: invite.role,
      invitedBy: invite.invitedBy,
    };
  }

  /**
   * A new authenticator secret for the person accepting: plain, to show as
   * a QR code, and sealed with the invite, to send back with a code.
   */
  async setupInvite(token: string): Promise<StaffTwoFactorSetup> {
    this.requireKey();
    const invite = await this.usableInvite(token);
    const secret = newTotpSecret();
    return {
      secret,
      uri: totpUri(secret, invite.email, 'Dossier Admin'),
      sealed: this.secrets.encrypt({
        kind: 'staff-setup',
        inviteId: invite.id,
        totp: secret,
        expiresAt: Date.now() + SETUP_MINUTES * 60_000,
      }),
    };
  }

  /**
   * Makes the account with two-factor already on, and signs in. 400 when a
   * code from the new secret doesn't check out; 409 when the email is
   * already staff.
   */
  async acceptInvite(
    { token, name, password, sealed, code }: StaffInviteAccept,
    ip: string | null,
  ): Promise<StaffInviteAccepted> {
    this.requireKey();
    const invite = await this.usableInvite(token);
    const setup = this.openSetup(sealed);
    if (!setup || setup.inviteId !== invite.id) {
      throw new BadRequestException(
        'Setting up took too long. Scan the new QR code and try again.',
      );
    }
    if (await this.limits.blocked(['staff-two-factor', invite.id])) {
      throw new HttpException(
        'Too many wrong codes. Wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const step = matchTotp(setup.totp, code);
    if (step === null) {
      await this.limits.hit(['staff-two-factor', invite.id]);
      throw new BadRequestException(
        'That code didn’t match. Check the app shows Dossier Admin, and use its newest code.',
      );
    }

    const now = new Date().toISOString();
    const recoveryCodes = newRecoveryCodes();
    const staff: StaffRecord = {
      id: `stf-${randomBytes(8).toString('hex')}`,
      // The invite's email and role win, whatever is passed here.
      email: invite.email,
      role: invite.role,
      name,
      createdAt: now,
      disabledAt: null,
      passwordHash: await hashPassword(password),
      totpSecret: this.secrets.encrypt({ totp: setup.totp }),
      totpLastStep: step,
      recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    };
    const outcome = await this.db.staff.acceptInvite(
      hashToken(token),
      staff,
      now,
    );
    if (outcome === 'invalid') throw unusableInvite();
    if (outcome === 'taken') {
      throw new ConflictException(
        'This email is already on the staff. Sign in instead.',
      );
    }
    await this.log.record(staff, {
      what: `Accepted the invite from ${invite.invitedBy} and joined as ${invite.role}`,
      ip,
    });
    return { ...(await this.startSession(staff.id)), recoveryCodes };
  }

  private async usableInvite(token: string) {
    const invite = await this.db.staff.findInvite(hashToken(token));
    if (!invite || invite.expiresAt <= new Date().toISOString()) {
      throw unusableInvite();
    }
    return invite;
  }

  // Sessions ------------------------------------------------------------------

  private async startSession(staffId: string): Promise<StaffSession> {
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      now.getTime() + this.sessionHours * 3_600_000,
    ).toISOString();
    await this.db.staffSessions.create({
      tokenHash: hashToken(token),
      staffId,
      createdAt: now.toISOString(),
      expiresAt,
      lastSeenAt: now.toISOString(),
    });
    return { token, expiresAt, me: await this.me(staffId) };
  }

  private openChallenge(challenge: string): string | null {
    try {
      const opened = challengeSchema.parse(this.secrets.decrypt(challenge));
      return opened.expiresAt > Date.now() ? opened.staffId : null;
    } catch {
      return null;
    }
  }

  private openSetup(sealed: string) {
    try {
      const opened = setupSchema.parse(this.secrets.decrypt(sealed));
      return opened.expiresAt > Date.now() ? opened : null;
    } catch {
      return null;
    }
  }

  private totpOf(staff: StaffRecord): string {
    try {
      return sealedTotpSchema.parse(this.secrets.decrypt(staff.totpSecret))
        .totp;
    } catch {
      return '';
    }
  }

  private requireKey() {
    if (!this.secrets.available) {
      throw new ServiceUnavailableException(
        'Staff sign-in needs CONNECTOR_SECRET_KEY set on the API.',
      );
    }
  }
}

/** A member of staff without their secrets. */
export function publicStaff({
  passwordHash: _hash,
  totpSecret: _secret,
  totpLastStep: _step,
  recoveryHashes: _codes,
  ...staff
}: StaffRecord) {
  return staff;
}
