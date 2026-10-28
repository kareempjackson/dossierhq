import { Injectable } from '@nestjs/common';

/**
 * Counts attempts per email in a sliding window and refuses more once there
 * are `max`. Kept in memory, so it is per API instance; move it to shared
 * storage when the API runs on more than one machine.
 */
class AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(email: string, now: number): number[] {
    const kept = (this.attempts.get(email) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    if (kept.length > 0) this.attempts.set(email, kept);
    else this.attempts.delete(email);
    return kept;
  }

  isBlocked(email: string, now = Date.now()): boolean {
    return this.recent(email, now).length >= this.max;
  }

  record(email: string, now = Date.now()): void {
    this.attempts.set(email, [...this.recent(email, now), now]);
  }

  reset(email: string): void {
    this.attempts.delete(email);
  }
}

/**
 * Slows down password guessing: after 5 failed sign-ins for an email within
 * 15 minutes, further attempts are refused until the window passes.
 */
@Injectable()
export class SignInLimiter extends AttemptLimiter {
  constructor() {
    super(5, 15 * 60_000);
  }

  recordFailure(email: string, now = Date.now()): void {
    this.record(email, now);
  }
}

/** Stops reset emails flooding an inbox: 3 per email address an hour. */
@Injectable()
export class ResetLimiter extends AttemptLimiter {
  constructor() {
    super(3, 60 * 60_000);
  }
}
