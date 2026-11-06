'use server';

import {
  recipientsUpdateSchema,
  recommendationUpdateSchema,
  type Recipient,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data/client-records';

/**
 * Changes made from a client's file: deciding on Dossier's drafts, and who
 * gets the weekly report. Each checks what it's given with the API's own
 * schema, asks the API, and words its no; the page then reads again.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

async function attempt(
  run: () => Promise<{ ok: true } | { ok: false; problem: string }>,
): Promise<ActionResult> {
  try {
    const result = await run();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

/** Accepts or dismisses a draft, or puts it back to draft. */
export async function decideRecommendation(
  id: string,
  status: 'accepted' | 'dismissed' | 'draft',
): Promise<ActionResult> {
  const update = recommendationUpdateSchema.safeParse({ status });
  if (!update.success) return { ok: false, error: 'That isn’t a decision.' };
  return attempt(() => data.updateRecommendation(id, update.data));
}

/** Rewords a draft's title. */
export async function rewordRecommendation(
  id: string,
  title: string,
): Promise<ActionResult> {
  const update = recommendationUpdateSchema.safeParse({ title });
  if (!update.success) {
    return {
      ok: false,
      error: update.error.issues[0]?.message ?? 'Check the wording.',
    };
  }
  return attempt(() => data.updateRecommendation(id, update.data));
}

/** Replaces who the client's weekly report goes to. */
export async function saveRecipients(
  clientId: string,
  recipients: Recipient[],
): Promise<ActionResult> {
  const update = recipientsUpdateSchema.safeParse({ recipients });
  if (!update.success) {
    return {
      ok: false,
      error: update.error.issues[0]?.message ?? 'Check the addresses.',
    };
  }
  return attempt(() => data.saveRecipients(clientId, update.data.recipients));
}
