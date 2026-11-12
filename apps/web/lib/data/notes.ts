import 'server-only';
import {
  meetingNoteSchema,
  notesInboxSchema,
  type MeetingNote,
  type NewMeetingNote,
  type NotesInbox,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet, apiSend } from '../api';
import { refused } from './refused';

/**
 * Notes from meetings Fathom didn't record, through the API. Notes that
 * mention one client's people are filed with that client as they arrive;
 * the rest wait in the inbox for someone to file them.
 */

type Refused = { ok: false; problem: string };

/** Notes waiting for a client, newest meeting first, and the forwarding address. */
export const getNotesInbox = cache((): Promise<NotesInbox> =>
  apiGet('/notes/inbox', notesInboxSchema),
);

/** Files notes with a client, or with null puts them back in the inbox. */
export async function fileNote(
  id: string,
  clientId: string | null,
): Promise<{ ok: true; note: MeetingNote } | Refused> {
  try {
    const note = await apiSend(
      'PATCH',
      `/notes/${encodeURIComponent(id)}`,
      { clientId },
      meetingNoteSchema,
    );
    return { ok: true, note };
  } catch (error) {
    return refused(error);
  }
}

/** Adds notes by hand, filed with a client or left in the inbox. */
export async function addNote(
  note: NewMeetingNote,
): Promise<{ ok: true; note: MeetingNote } | Refused> {
  try {
    return {
      ok: true,
      note: await apiSend('POST', '/notes', note, meetingNoteSchema),
    };
  } catch (error) {
    return refused(error);
  }
}
