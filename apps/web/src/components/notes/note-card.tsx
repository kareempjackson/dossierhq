import type { MeetingNote } from '@dossierhq/contracts';
import { ChevronRight } from 'lucide-react';
import type { ClientOption } from '@/components/client/add-meeting-notes';
import { formatCalendarDate } from '@/lib/format';
import { NoteActions } from './note-actions';

/**
 * Notes someone added, which open and close like a recorded meeting. With
 * `clients`, they're waiting in the inbox to be filed with one of them.
 */
export function NoteCard({
  note,
  open,
  clients,
}: {
  note: MeetingNote;
  open: boolean;
  clients?: ClientOption[];
}) {
  const by =
    note.via === 'email'
      ? `Emailed in by ${note.addedBy.name}`
      : `Added by ${note.addedBy.name}`;
  return (
    <li>
      <article
        aria-labelledby={`${note.id}-title`}
        className="rounded-card bg-sheet shadow-card"
      >
        <details open={open} className="group">
          <summary className="flex cursor-pointer list-none items-start gap-3 rounded-card p-5 [&::-webkit-details-marker]:hidden [&:hover_svg]:text-ink">
            <ChevronRight
              aria-hidden
              className="mt-1 size-4 shrink-0 text-muted transition-transform group-open:rotate-90"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2
                  id={`${note.id}-title`}
                  className="text-section font-semibold"
                >
                  {note.title}
                </h2>
                <p className="text-meta text-muted">
                  {formatCalendarDate(note.occurredOn)} · Notes
                </p>
              </div>
              <p className="mt-1 truncate text-meta text-muted group-open:whitespace-normal">
                {note.attendees.length > 0 ? note.attendees.join(', ') : by}
              </p>
            </div>
          </summary>

          <div className="px-5 pb-5 sm:pl-12">
            <p className="max-w-3xl text-body break-words whitespace-pre-wrap text-text">
              {note.body}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
              <p className="text-meta text-muted">{by}</p>
              <NoteActions id={note.id} title={note.title} clients={clients} />
            </div>
          </div>
        </details>
      </article>
    </li>
  );
}
