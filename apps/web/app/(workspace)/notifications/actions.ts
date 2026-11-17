'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { markNotificationsRead } from '@/lib/data/notifications';

/**
 * Marking notifications read. Each asks the API and words its no. With
 * `stay`, the page reads again afterwards; without it (opening a
 * notification's page), the person is already on their way elsewhere.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

async function mark(
  which: string[] | 'all',
  stay: boolean,
): Promise<ActionResult> {
  try {
    const result = await markNotificationsRead(which);
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  if (stay) refresh();
  return { ok: true };
}

/** Marks these read. */
export async function markRead(
  ids: string[],
  stay: boolean,
): Promise<ActionResult> {
  const valid = ids.filter((id) => typeof id === 'string' && id.length > 0);
  if (valid.length === 0 || valid.length > 100) {
    return { ok: false, error: 'Choose up to 100 notifications to mark read.' };
  }
  return mark(valid, stay);
}

/** Marks every one read. */
export async function markAllRead(): Promise<ActionResult> {
  return mark('all', true);
}
