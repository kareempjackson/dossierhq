import type { MeetingNote, NoteSource } from '@dossierhq/contracts';
import { stableHash } from '../integrations/ids.js';

/**
 * What lets Dossier cite notes filed with a client: the notes whole (no
 * quote), or words from them. Notes in the inbox belong to no client, so
 * nothing cites them there.
 */
export function noteSource(
  note: MeetingNote & { clientId: string },
  webUrl: string,
  quote: string | null = null,
): NoteSource {
  return {
    id:
      quote === null ? `src-${note.id}` : `src-${note.id}-${stableHash(quote)}`,
    clientId: note.clientId,
    kind: 'note',
    tool: null,
    noteId: note.id,
    quote,
    recordId: note.id,
    recordType: 'Meeting notes',
    title: note.title,
    recordedAt: `${note.occurredOn}T00:00:00.000Z`,
    url: `${webUrl.replace(/\/+$/, '')}/clients/${encodeURIComponent(note.clientId)}/meetings#${note.id}`,
    fields: [
      ...(note.attendees.length > 0
        ? [{ label: 'Attendees', value: note.attendees.join(', ') }]
        : []),
      { label: 'Added by', value: note.addedBy.name },
    ],
  };
}
