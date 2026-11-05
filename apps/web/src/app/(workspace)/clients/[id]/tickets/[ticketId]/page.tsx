import {
  sourceOrigin,
  type Source,
  type Ticket,
  type TicketEntry,
} from '@dossierhq/contracts';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Fragment, Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import {
  TicketInsightPanels,
  TicketInsightSkeleton,
} from '@/components/client/ticket-insight';
import { TicketStatus } from '@/components/client/ticket-status';
import { Panel } from '@/components/ui/panel';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { getNow, getSources, getTickets, getWorkspace } from '@/lib/data';
import { orEmpty, orNull } from '@/lib/data/safe';
import { formatRelative, formatTimestamp } from '@/lib/format';
import { sourceField } from '@/lib/sources';

// The client's ticket list already carries each ticket's entries, and the
// client sheet reads that list anyway, so a ticket costs no extra API call.

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/tickets/[ticketId]'>) {
  const { id, ticketId } = await params;
  const tickets = await getTickets({ clientId: id }).catch(orNull);
  const ticket = tickets?.find((t) => t.id === ticketId);
  return { title: ticket ? `#${ticket.number} ${ticket.subject}` : 'Ticket' };
}

export default function TicketPage({
  params,
}: PageProps<'/clients/[id]/tickets/[ticketId]'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <TicketView params={params} />
    </Suspense>
  );
}

async function TicketView({
  params,
}: Pick<PageProps<'/clients/[id]/tickets/[ticketId]'>, 'params'>) {
  const client = await loadClient(params);
  const { ticketId } = await params;
  const [tickets, now, workspace] = await Promise.all([
    getTickets({ clientId: client.id }).catch(orNull),
    getNow(),
    getWorkspace(),
  ]);
  const back = (
    <Link
      href={`/clients/${client.id}/tickets`}
      className="inline-flex items-center gap-1 rounded-row text-meta text-muted hover:text-ink"
    >
      <ChevronLeft aria-hidden className="size-4" />
      All tickets
    </Link>
  );
  if (tickets === null) {
    return (
      <ClientSheet client={client} tab="tickets">
        {back}
        <ErrorState what="this ticket" className="mt-4" />
      </ClientSheet>
    );
  }
  // Only this client's tickets are listed, so another client's is not found.
  const ticket = tickets.find((t) => t.id === ticketId);
  if (!ticket) notFound();
  const [source] = await getSources([ticket.sourceId]).catch(orEmpty);
  const timeZone = workspace.timeZone;

  return (
    <ClientSheet client={client} tab="tickets">
      {back}
      <header className="mt-4">
        <p className="font-mono text-mono text-muted">#{ticket.number}</p>
        <h2 className="mt-1 text-lead font-medium text-balance text-ink">
          {ticket.subject}
        </h2>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
          <TicketStatus ticket={ticket} className="text-ink" />
          <span aria-hidden>·</span>
          <span>Opened {formatTimestamp(ticket.openedAt, timeZone)}</span>
          <span aria-hidden>·</span>
          <span>Updated {formatRelative(ticket.updatedAt, now, timeZone)}</span>
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <section aria-labelledby="conversation-heading" className="min-w-0">
          <SectionHeader
            id="conversation-heading"
            as="h3"
            title="Conversation"
          />
          <Conversation ticket={ticket} timeZone={timeZone} />
          {ticket.entries.length > 0 && (
            <p className="mt-4 text-meta text-muted">
              Attachments, time entries and anything older are in NinjaOne.
            </p>
          )}
        </section>

        <aside aria-label="Ticket details" className="flex flex-col gap-4">
          <Suspense fallback={<TicketInsightSkeleton />}>
            <TicketInsightPanels ticketId={ticket.id} />
          </Suspense>
          <Panel id="ticket-details-heading" as="h3" title="Details">
            <Details ticket={ticket} source={source} timeZone={timeZone} />
          </Panel>
        </aside>
      </div>
    </ClientSheet>
  );
}

/** The description and the replies and notes after it, oldest first. */
function Conversation({
  ticket,
  timeZone,
}: {
  ticket: Ticket;
  timeZone: string;
}) {
  if (ticket.entriesAsOf === null) {
    return (
      <p className="mt-3 rounded-card bg-surface-soft p-5 text-meta text-muted">
        Dossier hasn’t read what’s written on this ticket yet. It comes in with
        the next NinjaOne sync.
      </p>
    );
  }
  if (ticket.entries.length === 0) {
    return (
      <p className="mt-3 rounded-card bg-surface-soft p-5 text-meta text-muted">
        Nothing’s been written on this ticket yet.
      </p>
    );
  }
  const behind =
    Date.parse(ticket.entriesAsOf) !== Date.parse(ticket.updatedAt);
  return (
    <>
      {behind && (
        <p className="mt-2 text-meta text-muted">
          The ticket changed after Dossier last read it; the next sync brings
          the latest.
        </p>
      )}
      <ol className="mt-3 flex flex-col gap-3">
        {ticket.entries.map((entry, i) => (
          <Entry key={`${entry.at}-${i}`} entry={entry} timeZone={timeZone} />
        ))}
      </ol>
    </>
  );
}

/** One entry. Internal notes look different, so they're never taken for replies. */
function Entry({ entry, timeZone }: { entry: TicketEntry; timeZone: string }) {
  return (
    <li>
      <article
        className={cn(
          'rounded-card p-5 shadow-card',
          entry.public ? 'bg-sheet' : 'bg-marker-highlight',
        )}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
            {entry.author ?? 'Not known'}
            {entry.kind === 'description' && (
              <Pill tone="quiet">Description</Pill>
            )}
            {!entry.public && <Pill>Internal note</Pill>}
          </p>
          <p className="text-meta text-muted">
            <time dateTime={entry.at}>
              {formatTimestamp(entry.at, timeZone)}
            </time>
          </p>
        </header>
        {/* Paragraphs come apart at blank lines; single breaks stay. */}
        <div className="mt-2 flex flex-col gap-2 break-words whitespace-pre-line text-text">
          {entry.text.split('\n\n').map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </article>
    </li>
  );
}

/** The ticket's fields, as the tool has them, and a way into the tool. */
function Details({
  ticket,
  source,
  timeZone,
}: {
  ticket: Ticket;
  source: Source | undefined;
  timeZone: string;
}) {
  const field = (label: string) => (source ? sourceField(source, label) : null);
  // Priority, severity and type only when the tool gave them.
  const rows: [label: string, value: string | null][] = [
    ['Status', ticket.status],
    ['Priority', field('Priority')],
    ['Severity', field('Severity')],
    ['Type', field('Type')],
    ['Requester', ticket.requester ?? 'Not known'],
    ['Assigned to', ticket.assignedTo ?? 'Not assigned'],
    ['Opened', formatTimestamp(ticket.openedAt, timeZone)],
    ['Last updated', formatTimestamp(ticket.updatedAt, timeZone)],
  ];

  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-meta">
        {rows.map(
          ([label, value]) =>
            value !== null && (
              <Fragment key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="break-words text-ink">{value}</dd>
              </Fragment>
            ),
        )}
      </dl>
      {source && (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-row text-meta font-medium text-brand-deep underline-offset-2 hover:underline"
        >
          Open in {sourceOrigin(source)}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      )}
    </>
  );
}
