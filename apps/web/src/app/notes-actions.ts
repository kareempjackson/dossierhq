'use server';

import { newMeetingNoteSchema } from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import * as data from '@/lib/data';
import type { ActionResult } from './actions';

const FIELDS = ['clientId', 'title', 'occurredOn', 'attendees', 'body'];

export type NotesState = {
  ok?: boolean;
  error?: string;
  /** The field the error is about. */
  field?: string;
  /** What was entered, to show again after a problem. */
  values?: Record<string, string>;
};

const unavailable =
  'Couldn’t save that. Check the API is running and try again.';

/** Adds notes from the form, filed with its client or left in the inbox. */
export async function addMeetingNotes(
  _previous: NotesState,
  formData: FormData,
): Promise<NotesState> {
  const values = Object.fromEntries(
    FIELDS.map((name) => [name, String(formData.get(name) ?? '')]),
  );
  const parsed = newMeetingNoteSchema.safeParse({
    clientId: values.clientId || null,
    title: values.title,
    occurredOn: values.occurredOn,
    attendees: values
      .attendees!.split(',')
      .map((name) => name.trim())
      .filter(Boolean),
    body: values.body,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue?.message ?? 'Check what you entered.',
      field: String(issue?.path[0] ?? ''),
      values,
    };
  }
  try {
    const result = await data.addNotes(parsed.data);
    if (!result.ok) return { error: result.problem, values };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable, values };
  }
  refresh();
  return { ok: true };
}

const filing = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1).nullable(),
});

/** Files notes with a client, or with null puts them back in the inbox. */
export async function fileNotes(
  id: string,
  clientId: string | null,
): Promise<ActionResult> {
  const parsed = filing.safeParse({ id, clientId });
  if (!parsed.success) return { ok: false, error: 'Choose a client first.' };
  try {
    await data.fileNotes(parsed.data.id, parsed.data.clientId);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

export async function deleteNotes(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'Those notes are already gone.' };
  try {
    await data.deleteNotes(id);
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}
