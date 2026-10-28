import { z } from 'zod';

/** How notes arrived: typed or pasted in Dossier, or forwarded by email. */
export const noteViaSchema = z.enum(['paste', 'email']);
export type NoteVia = z.infer<typeof noteViaSchema>;

/**
 * Notes from a meeting Fathom didn't record, in someone's own words. Notes
 * no client claims wait in the notes inbox until someone files them.
 */
export const meetingNoteSchema = z.object({
  id: z.string(),
  /** Null while it waits in the inbox. */
  clientId: z.string().nullable(),
  title: z.string(),
  /** The day of the meeting, `YYYY-MM-DD`. */
  occurredOn: z.iso.date(),
  /** Who was there, as written. */
  attendees: z.array(z.string()),
  /** The notes as written or forwarded, in plain text. */
  body: z.string(),
  via: noteViaSchema,
  /** Who added or forwarded them, as they were then. */
  addedBy: z.object({ userId: z.string().nullable(), name: z.string() }),
  createdAt: z.iso.datetime(),
});
export type MeetingNote = z.infer<typeof meetingNoteSchema>;

/** Most of a meeting's notes; longer is likely a transcript or a thread. */
export const NOTE_MAX_LENGTH = 50_000;

/** Adding notes by hand. A blank title becomes "Meeting notes". */
export const newMeetingNoteSchema = z.object({
  /** Null, or left out, to leave them in the inbox. */
  clientId: z.string().min(1).nullable().default(null),
  title: z.string().trim().max(200).default(''),
  occurredOn: z.iso.date({ error: 'Enter the day of the meeting' }),
  attendees: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  body: z
    .string()
    .trim()
    .min(1, 'Paste or type the notes')
    .max(NOTE_MAX_LENGTH, 'That’s longer than meeting notes can be'),
});
export type NewMeetingNote = z.input<typeof newMeetingNoteSchema>;

/** `GET /notes`: one client's notes. */
export const notesQuerySchema = z.object({ clientId: z.string().min(1) });

/** Files notes with a client, or with null puts them back in the inbox. */
export const noteFilingSchema = z.object({
  clientId: z.string().min(1).nullable(),
});
export type NoteFiling = z.infer<typeof noteFilingSchema>;

/** Notes waiting for a client, and where to forward more. */
export const notesInboxSchema = z.object({
  /** The workspace's own address; null until inbound email is set up. */
  address: z.string().nullable(),
  /** Newest meeting first. */
  notes: z.array(meetingNoteSchema),
});
export type NotesInbox = z.infer<typeof notesInboxSchema>;
