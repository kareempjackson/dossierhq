import type { AiRetry } from '@dossierhq/database';
import { IntelligenceFailure } from './model.js';

/** After the first failure an unchanged item waits this long… */
const FIRST_WAIT_MS = 60 * 60 * 1000;
/** …then twice as long each time, up to this. */
const MAX_WAIT_MS = 7 * 24 * 60 * 60 * 1000;
/** After this many failures on the same input, it waits for the input to change. */
export const MAX_ATTEMPTS = 6;

/** How long an item that has failed `attempts` times waits: 1 h, 2 h, 4 h… */
export const retryWaitMs = (attempts: number) =>
  Math.min(FIRST_WAIT_MS * 2 ** Math.max(attempts - 1, 0), MAX_WAIT_MS);

/**
 * Whether to read an item now, given how reading `inputHash` has gone
 * before. A read that failed waits longer after each failure, and after
 * MAX_ATTEMPTS stops until what it reads changes: an input the model can't
 * handle is never tried for ever.
 */
export function mayTry(
  retry: AiRetry | undefined,
  inputHash: string,
  now: number,
): boolean {
  if (!retry || retry.inputHash !== inputHash) return true;
  if (retry.attempts >= MAX_ATTEMPTS) return false;
  return now - Date.parse(retry.attemptedAt) >= retryWaitMs(retry.attempts);
}

/**
 * Whether a failure says something about the item that was read. Being
 * told to slow down, or held at a limit, doesn't: the same item may read
 * fine once that lifts, so it isn't counted against it.
 */
export const itemFailed = (error: unknown) =>
  !(error instanceof IntelligenceFailure && error.rateLimited);
