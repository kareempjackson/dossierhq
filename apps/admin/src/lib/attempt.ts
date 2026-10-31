import 'server-only';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import type { Refusal } from './data';

/** What a Server Action that changes something answers. */
export type ActionResult = { ok: true } | { ok: false; error: string };

export const UNAVAILABLE =
  'Couldn’t save that. Check the API is running and try again.';

/**
 * Runs a change from a Server Action, refreshes the page on success, and
 * words any refusal. Not itself an action: only call it from one.
 */
export async function attempt(
  change: () => Promise<{ ok: true } | Refusal>,
): Promise<ActionResult> {
  try {
    const result = await change();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: UNAVAILABLE };
  }
  refresh();
  return { ok: true };
}
