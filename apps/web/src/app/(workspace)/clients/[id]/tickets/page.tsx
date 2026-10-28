import type { Ticket } from '@dossierhq/contracts';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { DataList, type DataRow } from '@/components/ui/data-list';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import {
  getClient,
  getNow,
  getSources,
  getTickets,
  getWorkspace,
} from '@/lib/data';
import { formatRelative } from '@/lib/format';
import { orEmpty, orNull } from '@/lib/data/safe';
import { presentOptions } from '@/lib/list-options';

const urgency: Record<
  Ticket['urgency'],
  { tone: StatusTone; label: string | null }
> = {
  critical: { tone: 'failure', label: 'Critical' },
  high: { tone: 'strong', label: 'High priority' },
  normal: { tone: 'neutral', label: null },
};

const STATUSES = { open: 'Open', closed: 'Closed' };
const PRIORITIES: Record<Ticket['urgency'], string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
};

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/tickets'>) {
  const client = await getClient((await params).id).catch(orNull);
  return { title: client ? `${client.name} tickets` : 'Tickets' };
}

export default function TicketsPage({
  params,
}: PageProps<'/clients/[id]/tickets'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <Tickets params={params} />
    </Suspense>
  );
}

async function Tickets({
  params,
}: Pick<PageProps<'/clients/[id]/tickets'>, 'params'>) {
  const client = await loadClient(params);
  const [tickets, now, workspace] = await Promise.all([
    getTickets({ clientId: client.id }).catch(orNull),
    getNow(),
    getWorkspace(),
  ]);
  // The records behind them, for links into NinjaOne.
  const sources = await getSources(
    (tickets ?? []).map((t) => t.sourceId),
  ).catch(orEmpty);
  const links = new Map(sources.map((s) => [s.id, s.url]));

  const rows: DataRow[] = (tickets ?? []).map((ticket) => ({
    id: ticket.id,
    text: [
      `#${ticket.number}`,
      ticket.subject,
      ticket.status,
      ticket.requester,
      ticket.assignedTo,
    ]
      .filter(Boolean)
      .join(' '),
    values: {
      status: ticket.open ? 'open' : 'closed',
      priority: ticket.urgency,
    },
    node: (
      <TicketRow
        ticket={ticket}
        url={links.get(ticket.sourceId)}
        now={now}
        timeZone={workspace.timeZone}
      />
    ),
  }));

  return (
    <ClientSheet client={client} tab="tickets">
      {tickets === null ? (
        <ErrorState what="tickets" />
      ) : tickets.length === 0 ? (
        <EmptyState title="No tickets yet.">
          Tickets for {client.name} appear once NinjaOne is connected with a
          technician’s sign-in, on the{' '}
          <Link href="/connections" className="underline underline-offset-2">
            Connections
          </Link>{' '}
          page.
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-meta text-muted">
            From NinjaOne: open tickets first, the most urgent at the top, then
            those closed in the last 90 days.
          </p>
          <DataList
            rows={rows}
            noun={['ticket', 'tickets']}
            placeholder="Search number, subject, people"
            filters={[
              {
                name: 'status',
                label: 'Status',
                options: presentOptions(
                  tickets.map((t) => (t.open ? 'open' : 'closed')),
                  STATUSES,
                ),
              },
              {
                name: 'priority',
                label: 'Priority',
                as: 'menu',
                options: presentOptions(
                  tickets.map((t) => t.urgency),
                  PRIORITIES,
                ),
              },
            ]}
            layout={{
              kind: 'table',
              caption: `Tickets at ${client.name}: open first, most urgent first, then closed, newest first`,
              head: (
                <thead className="text-meta text-muted">
                  <tr className="border-b border-hairline">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Ticket
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Requester
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Assigned to
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Updated
                    </th>
                  </tr>
                </thead>
              ),
            }}
          />
        </>
      )}
    </ClientSheet>
  );
}

function TicketRow({
  ticket,
  url,
  now,
  timeZone,
}: {
  ticket: Ticket;
  url: string | undefined;
  now: string;
  timeZone: string;
}) {
  const level = urgency[ticket.urgency];
  return (
    <tr className="align-top transition-colors hover:bg-surface-soft">
      <th scope="row" className="px-4 py-2.5 font-normal text-ink">
        <span className="mr-2 font-mono text-mono text-muted">
          #{ticket.number}
        </span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-row underline-offset-2 hover:underline"
          >
            {ticket.subject}
          </a>
        ) : (
          ticket.subject
        )}
      </th>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <StatusDot
          tone={ticket.open ? level.tone : 'positive'}
          label={
            ticket.open && level.label
              ? `${ticket.status} · ${level.label}`
              : ticket.status
          }
        />
      </td>
      <td className="px-4 py-2.5 text-muted">
        {ticket.requester ?? 'Not known'}
      </td>
      <td className="px-4 py-2.5 text-muted">
        {ticket.assignedTo ?? 'Not assigned'}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-muted">
        {formatRelative(ticket.updatedAt, now, timeZone)}
      </td>
    </tr>
  );
}
