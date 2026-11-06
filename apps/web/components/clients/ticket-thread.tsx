import type { Ticket, TicketEntry, TicketSide } from '@dossierhq/contracts';
import { Avatar, type AvatarTone } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/tag';
import { andList } from '@/lib/client-paths';
import { cn } from '@/lib/cn';
import { dayMonthTime, fullTime, plural } from '@/lib/format';

/** How a side reads beside a name. */
export function sideLabel(side: TicketSide | null, clientName: string) {
  switch (side) {
    case 'client':
      return clientName;
    case 'msp':
      return 'Your team';
    case 'outside':
      return 'Outside';
    case 'automated':
      return 'Automated';
    default:
      return null;
  }
}

export const toneOf = (side: TicketSide | null): AvatarTone =>
  side === 'client' ? 'client' : side === 'msp' ? 'msp' : 'neutral';

/**
 * Everything written on a ticket, oldest first: the emails it was raised
 * with, one by one, then the replies and the technicians' notes.
 */
export function TicketThread({
  ticket,
  clientName,
  timeZone,
  now,
}: {
  ticket: Ticket;
  clientName: string;
  timeZone: string;
  now: Date;
}) {
  if (ticket.entriesAsOf === null) {
    return (
      <p className="mt-3 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
        Dossier hasn’t read what’s written on this ticket yet. It comes in with
        the next NinjaOne sync.
      </p>
    );
  }
  if (ticket.entries.length === 0) {
    return (
      <p className="mt-3 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
        Nothing’s been written on this ticket yet.
      </p>
    );
  }
  const behind =
    Date.parse(ticket.entriesAsOf) !== Date.parse(ticket.updatedAt);
  const notes = ticket.entries.filter((entry) => !entry.public).length;
  const messages = ticket.entries.length - notes;
  return (
    <>
      <p className="mt-1 text-small text-muted">
        {plural(messages, 'message')}
        {notes > 0 && ` · ${plural(notes, 'internal note')}`}
      </p>
      {behind && (
        <p className="mt-2 text-small text-muted">
          The ticket changed after Dossier last read it; the next sync brings
          the latest.
        </p>
      )}
      <ol className="mt-4 flex flex-col gap-3">
        {ticket.entries.map((entry, index) => (
          <Entry
            key={entry.id ?? `${entry.at}-${index}`}
            entry={entry}
            clientName={clientName}
            timeZone={timeZone}
            now={now}
          />
        ))}
      </ol>
      <p className="mt-4 text-small text-muted">
        {ticket.entriesComplete
          ? 'Attachments and time entries are in NinjaOne.'
          : 'Attachments, time entries and anything older are in NinjaOne.'}
      </p>
    </>
  );
}

/**
 * One entry, under who wrote it. Internal notes look different, so they're
 * never taken for something the client saw.
 */
function Entry({
  entry,
  clientName,
  timeZone,
  now,
}: {
  entry: TicketEntry;
  clientName: string;
  timeZone: string;
  now: Date;
}) {
  const author = entry.author ?? 'Not known';
  const side = sideLabel(entry.side, clientName);
  return (
    <li className="flex gap-3">
      <Avatar name={author} tone={toneOf(entry.side)} className="mt-0.5" />
      <article
        className={cn(
          'min-w-0 flex-1 rounded-xl px-4 py-3.5',
          entry.public ? 'bg-grey-1' : 'bg-lime-soft',
        )}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-small">
            <span className="font-medium">{author}</span>
            {side && <span className="text-muted">{side}</span>}
            {entry.via && <span className="text-muted">via {entry.via}</span>}
            {entry.kind === 'description' && <Tag>Description</Tag>}
            {!entry.public && <Tag tone="act">Internal note</Tag>}
          </p>
          <p className="text-[0.75rem] text-muted">
            <time dateTime={entry.at} title={fullTime(entry.at, timeZone)}>
              {dayMonthTime(entry.at, timeZone, now)}
            </time>
          </p>
        </header>
        {(entry.to.length > 0 || entry.cc.length > 0) && (
          <p className="mt-1 text-[0.75rem] text-muted">
            {entry.to.length > 0 && <>To {andList(entry.to)}</>}
            {entry.to.length > 0 && entry.cc.length > 0 && ' · '}
            {entry.cc.length > 0 && <>Cc {andList(entry.cc)}</>}
          </p>
        )}
        {/* Paragraphs come apart at blank lines; single breaks stay. */}
        <div className="mt-2 flex flex-col gap-2 text-small wrap-break-word whitespace-pre-line">
          {entry.text.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </article>
    </li>
  );
}
