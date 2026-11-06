import {
  ticketReporter,
  ticketTechnicians,
  type Ticket,
  type TicketPerson,
} from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ClientTab, ReadFailed } from '@/components/clients/client-tab';
import {
  sideLabel,
  TicketThread,
  toneOf,
} from '@/components/clients/ticket-thread';
import { Avatar } from '@/components/ui/avatar';
import { ButtonAnchor } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import { personId, ticketHref, userHref } from '@/lib/client-paths';
import { priorityOf } from '@/lib/client-views';
import { getSources, getTicket } from '@/lib/data/client-records';
import { getClient } from '@/lib/data/clients';
import { orNull } from '@/lib/data/safe';
import { ago, dayMonthTime, fullTime } from '@/lib/format';

type Params = PageProps<'/clients/[id]/tickets/[number]'>['params'];

/** Tickets are read at request time; a placeholder builds the shell. */
export function generateStaticParams() {
  return [{ number: '__shell__' }];
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, number } = await params;
  const [client, ticket] = await Promise.all([
    getClient(id).catch(orNull),
    getTicket(id, number).catch(orNull),
  ]);
  return {
    title: ticket
      ? `#${ticket.number} ${ticket.subject}${client ? ` · ${client.name}` : ''}`
      : 'Ticket',
  };
}

/**
 * One ticket: everything written on it, oldest first — the emails it was
 * raised with one by one, then the replies and the technicians' notes — and
 * beside it who started it, who worked it and who else is on it.
 */
export default function TicketPage({ params }: { params: Params }) {
  return (
    <ClientTab
      params={params}
      render={async (client, { timeZone, now }) => {
        const { number } = await params;
        const tickets = `/clients/${encodeURIComponent(client.id)}/tickets`;
        const back = (
          <TextLink href={tickets} className="text-small">
            ← All tickets
          </TextLink>
        );
        let ticket: Ticket | null;
        try {
          ticket = await getTicket(client.id, number);
        } catch {
          return (
            <>
              {back}
              <div className="mt-4">
                <ReadFailed what="this ticket" />
              </div>
            </>
          );
        }
        if (ticket === null) notFound();

        const source = (await getSources([ticket.sourceId]).catch(orNull))?.get(
          ticket.sourceId,
        );
        const priority = priorityOf(ticket.urgency);
        const reporter = ticketReporter(ticket);
        const cameVia = ticket.entries.find(
          (entry) => entry.kind === 'description',
        )?.via;
        const technicians = ticketTechnicians(ticket);
        const others = ticket.people.filter(
          (person) =>
            person.role === 'involved' &&
            (person.side === 'client' || person.side === 'outside'),
        );

        return (
          <>
            {back}
            <header className="mt-4">
              <p className="font-mono text-label tracking-normal text-muted">
                #{ticket.number}
              </p>
              <h2 className="mt-1 text-h2 text-balance">{ticket.subject}</h2>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
                <Tag tone={ticket.open ? 'act' : 'neutral'}>
                  {ticket.status}
                </Tag>
                <Tag tone={priority.tone}>{priority.label}</Tag>
                <span>
                  Opened{' '}
                  <time
                    dateTime={ticket.openedAt}
                    title={fullTime(ticket.openedAt, timeZone)}
                  >
                    {dayMonthTime(ticket.openedAt, timeZone, now)}
                  </time>
                </span>
                <span aria-hidden>·</span>
                <span>
                  Updated{' '}
                  <time
                    dateTime={ticket.updatedAt}
                    title={fullTime(ticket.updatedAt, timeZone)}
                  >
                    {ago(ticket.updatedAt, now, timeZone)}
                  </time>
                </span>
              </p>
              {ticket.mergedInto && (
                <p className="mt-4 rounded-xl bg-lilac-soft px-4 py-3 text-small text-lilac-ink">
                  A technician merged this ticket into{' '}
                  <TextLink href={ticketHref(client.id, ticket.mergedInto)}>
                    #{ticket.mergedInto}
                  </TextLink>
                  , where the conversation carries on.
                </p>
              )}
            </header>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <section aria-labelledby="conversation" className="min-w-0">
                <h3
                  id="conversation"
                  className="font-sans text-small font-medium tracking-normal"
                >
                  Conversation
                </h3>
                <TicketThread
                  ticket={ticket}
                  clientName={client.name}
                  timeZone={timeZone}
                  now={now}
                />
              </section>

              <aside
                aria-label="Ticket details"
                className="flex flex-col gap-5 self-start"
              >
                <Facet title="Reported by">
                  {reporter ? (
                    <Person
                      person={reporter}
                      clientId={client.id}
                      clientName={client.name}
                      note={cameVia ? `via ${cameVia}` : null}
                    />
                  ) : (
                    <p className="text-small text-muted">
                      {ticket.requester ?? 'Not known'}
                    </p>
                  )}
                </Facet>

                <Facet title="Technicians">
                  {technicians.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {technicians.map((name) => (
                        <li key={name} className="flex items-center gap-2.5">
                          <Avatar name={name} tone="msp" size="sm" />
                          <span className="min-w-0 text-small">
                            <span className="font-medium">{name}</span>
                            {name === ticket.assignedTo && (
                              <span className="text-muted"> · assigned</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-small text-muted">Unassigned</p>
                  )}
                </Facet>

                {others.length > 0 && (
                  <Facet title="Also on it">
                    <ul className="flex flex-col gap-2">
                      {others.map((person) => (
                        <li key={`${person.name}-${person.email ?? ''}`}>
                          <Person
                            person={person}
                            clientId={client.id}
                            clientName={client.name}
                          />
                        </li>
                      ))}
                    </ul>
                  </Facet>
                )}

                <dl className="flex flex-col gap-1.5">
                  {[
                    { label: 'Status', value: ticket.status },
                    { label: 'Priority', value: priority.label },
                  ].map((fact) => (
                    <div
                      key={fact.label}
                      className="flex items-center justify-between gap-4 rounded-lg bg-grey-1 px-3 py-2.5 text-small"
                    >
                      <dt className="text-muted">{fact.label}</dt>
                      <dd className="text-right font-medium">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                {source && (
                  <ButtonAnchor
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    Open in NinjaOne
                  </ButtonAnchor>
                )}
              </aside>
            </div>
          </>
        );
      }}
    />
  );
}

function Facet({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 font-sans text-[0.75rem] font-normal tracking-normal text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Someone on the ticket: the client's people link to their page; anyone
 * else says whose side they're on.
 */
function Person({
  person,
  clientId,
  clientName,
  note = null,
}: {
  person: TicketPerson;
  clientId: string;
  clientName: string;
  note?: string | null;
}) {
  const id = person.side === 'client' ? personId(person.name) : null;
  const side = sideLabel(person.side, clientName);
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={person.name} tone={toneOf(person.side)} size="sm" />
      <div className="min-w-0 text-small">
        <p className="font-medium">
          {id ? (
            <TextLink href={userHref(clientId, id)}>{person.name}</TextLink>
          ) : (
            person.name
          )}
        </p>
        <p className="truncate text-[0.75rem] text-muted">
          {[person.side === 'client' ? null : side, note]
            .filter(Boolean)
            .join(' · ') || side}
        </p>
      </div>
    </div>
  );
}
