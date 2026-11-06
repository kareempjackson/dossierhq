import { ApiError } from '../api';

/**
 * The API's no, in its own words, for the screen to show; anything else is
 * rethrown. A 4xx with a message, or a tool, mail provider or setting the
 * API depends on saying no (502, 503).
 */
export function refused(error: unknown): { ok: false; problem: string } {
  if (error instanceof ApiError && error.problem && error.status < 500) {
    return { ok: false, problem: error.problem };
  }
  if (
    error instanceof ApiError &&
    (error.status === 502 || error.status === 503) &&
    error.problem
  ) {
    return { ok: false, problem: error.problem };
  }
  throw error;
}
