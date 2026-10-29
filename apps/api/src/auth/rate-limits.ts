import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DATABASE } from '../database/database.module.js';

const MINUTE = 60_000;

/**
 * Every limit, per key. Emails are limited whether or not they have an
 * account, so a lockout never reveals which emails do.
 */
export const LIMITS = {
  /** Failed sign-ins for one email. */
  'sign-in-email': { max: 5, windowMs: 15 * MINUTE },
  /** Failed sign-ins from one address, across emails. */
  'sign-in-ip': { max: 20, windowMs: 15 * MINUTE },
  /** New workspaces from one address; also slows checking which emails sign up says are taken. */
  'sign-up-ip': { max: 5, windowMs: 60 * MINUTE },
  /** Reset emails to one address, so they can't flood an inbox. */
  'reset-email': { max: 3, windowMs: 60 * MINUTE },
  /** Reset emails asked for from one address. */
  'reset-ip': { max: 10, windowMs: 60 * MINUTE },
  /** Wrong two-factor codes for one person. */
  'two-factor-user': { max: 5, windowMs: 15 * MINUTE },
  /** Invites one workspace sends: open sign-up mustn't mean emailing strangers. */
  invites: { max: 20, windowMs: 24 * 60 * MINUTE },
  /** Notes emailed to one workspace, so a leaked address can't flood its inbox. */
  'notes-inbox': { max: 60, windowMs: 60 * MINUTE },
  /** Questions one person asks Dossier; each costs a model run. */
  ask: { max: 20, windowMs: 60 * MINUTE },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Nothing looks further back than this, so older hits are pruned. */
const LONGEST_MS = Math.max(...Object.values(LIMITS).map((l) => l.windowMs));
const PRUNE_EVERY_MS = 60 * MINUTE;

/**
 * Rate limits kept in the database, so they hold across restarts and API
 * instances. Keys (an email, an address, a workspace) are stored hashed.
 * Limits run on real time, never the pinned test clock.
 */
@Injectable()
export class RateLimits implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimits.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.prune(), PRUNE_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /**
   * True when any of the limits is used up for its key. A null key (say, an
   * address the API doesn't know) is skipped.
   */
  async blocked(
    ...checks: [LimitName, string | null | undefined][]
  ): Promise<boolean> {
    const now = Date.now();
    for (const [name, key] of checks) {
      if (!key) continue;
      const { max, windowMs } = LIMITS[name];
      const since = new Date(now - windowMs).toISOString();
      if ((await this.db.rateLimits.count(bucket(name, key), since)) >= max) {
        return true;
      }
    }
    return false;
  }

  /** Counts an attempt against each limit with a key. */
  async hit(...checks: [LimitName, string | null | undefined][]) {
    const at = new Date().toISOString();
    for (const [name, key] of checks) {
      if (key) await this.db.rateLimits.hit(bucket(name, key), at);
    }
  }

  /** Forgets a key's attempts, e.g. an email's once its sign-in works. */
  async clear(name: LimitName, key: string) {
    await this.db.rateLimits.clear(bucket(name, key));
  }

  private async prune() {
    try {
      await this.db.rateLimits.prune(
        new Date(Date.now() - LONGEST_MS).toISOString(),
      );
    } catch (error) {
      this.logger.warn(
        `Couldn’t prune rate limits: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

const bucket = (name: LimitName, key: string) =>
  `${name}:${createHash('sha256').update(key.toLowerCase()).digest('hex')}`;
