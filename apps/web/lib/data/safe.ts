import { unstable_rethrow } from 'next/navigation';

/**
 * For `.catch()` on reads: turns a failure into null so the section shows
 * its error state, but lets Next's own redirects (such as "session expired,
 * sign in again") and not-found through.
 */
export function orNull(error: unknown): null {
  unstable_rethrow(error);
  return null;
}
