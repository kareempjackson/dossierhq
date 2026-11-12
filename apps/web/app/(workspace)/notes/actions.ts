'use server';

import { newMeetingNoteSchema, noteFilingSchema } from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data/notes';

/**
 * Filing notes with a client, putting them back, and adding notes by hand.
 * Each checks what it's given with the API's own schema, asks the API, and
 * words its no; the page then reads again.
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

/** Files the notes with a client, or with null puts them back in the inbox. */
export async function fileNote(
  noteId: string,
  clientId: string | null,
): Promise<ActionResult> {
  const filing = noteFilingSchema.safeParse({ clientId });
  if (!noteId || !filing.success) {
    return { ok: false, error: 'Choose the client these notes belong to.' };
  }
  return attempt(() => data.fileNote(noteId, filing.data.clientId));
}

/** Adds notes typed or pasted in Dossier. */
export async function addNote(input: {
  title: string;
  occurredOn: string;
  /** Who was there, separated by commas or new lines. */
  attendees: string;
  body: string;
  clientId: string | null;
}): Promise<ActionResult> {
  const note = newMeetingNoteSchema.safeParse({
    title: input.title,
    occurredOn: input.occurredOn,
    attendees: input.attendees
      .split(/[,\n]/)
      .map((name) => name.trim())
      .filter(Boolean),
    body: input.body,
    clientId: input.clientId || null,
  });
  if (!note.success) {
    return {
      ok: false,
      error: note.error.issues[0]?.message ?? 'Check the notes and try again.',
    };
  }
  return attempt(() => data.addNote(note.data));
}
