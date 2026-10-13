import { Injectable } from '@nestjs/common';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

/**
 * Slows down password guessing: after 5 failed sign-ins for an email within
 * 15 minutes, further attempts are refused until the window passes. Kept in
 * memory, so it is per API instance; move it to shared storage when the API
 * runs on more than one machine.
 */
@Injectable()
export class SignInLimiter {
  private readonly failures = new Map<string, number[]>();

  private recent(email: string, now: number): number[] {
    const kept = (this.failures.get(email) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );
    if (kept.length > 0) this.failures.set(email, kept);
    else this.failures.delete(email);
    return kept;
  }

  isBlocked(email: string, now = Date.now()): boolean {
    return this.recent(email, now).length >= MAX_FAILURES;
  }

  recordFailure(email: string, now = Date.now()): void {
    this.failures.set(email, [...this.recent(email, now), now]);
  }

  reset(email: string): void {
    this.failures.delete(email);
  }
}
