'use server';

import { meetingAttachmentSchema } from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data/meetings';

/**
 * Attaching a recording Fathom couldn't place to the client it was with.
 * It checks what it's given with the API's own schema, asks the API, and
 * words its no; the page then reads again.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

export async function attachMeeting(
  meetingId: string,
  clientId: string,
): Promise<ActionResult> {
  const body = meetingAttachmentSchema.safeParse({ clientId });
  if (!meetingId || !body.success) {
    return { ok: false, error: 'Choose the client this meeting was with.' };
  }
  try {
    const result = await data.attachMeeting(meetingId, body.data.clientId);
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}
