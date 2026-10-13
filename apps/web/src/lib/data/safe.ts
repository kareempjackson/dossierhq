import { unstable_rethrow } from 'next/navigation';

/**
 * For `.catch()` on reads: turns a failure into an empty value so the section
 * shows its error state, but lets Next's own redirects (such as "session
 * expired, sign in again") and not-found through.
 */
export function orNull(error: unknown): null {
  unstable_rethrow(error);
  return null;
}

export function orEmpty(error: unknown): never[] {
  unstable_rethrow(error);
  return [];
}
