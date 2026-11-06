import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, unstable_rethrow } from 'next/navigation';
import { ClientTab, ReadFailed } from '@/components/clients/client-tab';
import { Mark } from '@/components/brand/logo';
import { ButtonAnchor } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import { initials, ticketHref } from '@/lib/client-paths';
import {
  personSourceIds,
  personView,
  type ReadLine,
  type TicketRow,
} from '@/lib/client-views';
import { getEndUser, getSources } from '@/lib/data/client-records';
import { getClient } from '@/lib/data/clients';
import { orNull } from '@/lib/data/safe';
import { plural } from '@/lib/format';

type Params = PageProps<'/clients/[id]/users/[userId]'>['params'];

/** Enough to see what's going on; the Tickets tab has the rest. */
const TICKETS_SHOWN = 10;

/** People are read at request time; a placeholder builds the shell. */
export function generateStaticParams() {
  return [{ userId: '__shell__' }];
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, userId } = await params;
  const [client, detail] = await Promise.all([
    getClient(id).catch(orNull),
    getEndUser(id, userId).catch(orNull),
  ]);
  return {
    title: detail
      ? `${detail.user.name}${client ? ` · ${client.name}` : ''}`
      : 'Person',
  };
}

/**
 * One person at a client: what Dossier read about them, what needs
 * attention, the devices they sign in to, the tickets they raised and the
 * meetings they were in, with what they said there.
 */
export default function PersonPage({ params }: { params: Params }) {
  return (
    <ClientTab
      params={params}
      render={async (client, context) => {
        const { userId } = await params;
        const users = `/clients/${encodeURIComponent(client.id)}/users`;
        const back = (
          <TextLink href={users} className="text-small">
            ← All users
          </TextLink>
        );
        const detail = await getEndUser(client.id, userId).catch(
          (error: unknown) => {
            unstable_rethrow(error);
            return undefined;
          },
        );
        if (detail === null) notFound();
        if (detail === undefined) {
          return (
            <>
              {back}
              <div className="mt-4">
                <ReadFailed what="this person" />
              </div>
            </>
          );
        }
        const sources =
          (await getSources(personSourceIds(detail)).catch(orNull)) ??
          new Map();
        const person = personView(detail, sources, context);
        const base = `/clients/${encodeURIComponent(client.id)}`;

        return (
          <>
            {back}
            <header className="mt-4 flex items-center gap-4">
              <span
                aria-hidden
                className="grid size-14 shrink-0 place-items-center rounded-full bg-lilac-soft font-display text-h3 text-lilac-ink"
              >
                {initials(person.name)}
              </span>
              <div className="min-w-0">
                <h2 className="text-h2">{person.name}</h2>
                {person.facts && (
                  <p className="mt-1 text-small text-muted">{person.facts}</p>
                )}
              </div>
            </header>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="flex min-w-0 flex-col gap-8">
                <section
                  aria-labelledby="dossier-read"
                  className="rounded-2xl bg-linear-to-br from-lilac-mist to-lilac-soft p-5"
                >
                  <h3
                    id="dossier-read"
                    className="flex items-center gap-2 font-sans text-small font-normal tracking-normal text-lilac-ink"
                  >
                    <Mark height={12} />
                    Dossier’s read
                    {person.profile && (
                      <span className="text-muted">
                        · {person.profile.read}
                      </span>
                    )}
                  </h3>
                  {person.profile ? (
                    <>
                      <p className="mt-2 font-display text-h3">
                        {person.profile.summary}
                      </p>
                      <Lines
                        title="Keeps coming back"
                        lines={person.profile.recurring}
                      />
                      <Lines
                        title="Their devices"
                        lines={person.profile.devices}
                      />
                      <Lines
                        title="Still open"
                        lines={person.profile.openLoops}
                      />
                      {person.profile.tone && (
                        <p className="mt-4 text-small text-muted">
                          <span className="font-medium text-ink">
                            For your team only:
                          </span>{' '}
                          {person.profile.tone}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-small text-muted">
                      Dossier hasn’t written about {person.name} yet. It reads
                      their tickets, devices and meetings after a sync, when
                      people profiles are on in Intelligence.
                    </p>
                  )}
                </section>

                {person.attention.length > 0 && (
                  <section aria-labelledby="person-attention">
                    <h3
                      id="person-attention"
                      className="font-sans text-small font-normal tracking-normal text-muted"
                    >
                      What needs attention
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2">
                      {person.attention.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-grey-1 px-4 py-3"
                        >
                          <div className="min-w-[14rem] flex-1">
                            <p className="font-medium">{item.title}</p>
                            <p className="text-small text-muted">
                              {item.detail}
                            </p>
                          </div>
                          <Tag tone={item.status.tone}>{item.status.label}</Tag>
                          {item.source && (
                            <a
                              href={item.source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-sm text-small text-muted underline decoration-ink/20 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink sm:w-20 sm:text-right"
                            >
                              {item.source.name}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <PersonTickets
                  id="person-tickets"
                  title="Tickets they raised"
                  tickets={person.tickets}
                  clientId={client.id}
                  all={`${base}/tickets`}
                  empty={`No tickets from ${person.name}.`}
                />

                {person.involvedTickets.length > 0 && (
                  <PersonTickets
                    id="person-involved"
                    title="Tickets they’re on"
                    tickets={person.involvedTickets}
                    clientId={client.id}
                    all={`${base}/tickets`}
                    showReporter
                  />
                )}

                <section aria-labelledby="person-meetings">
                  <h3
                    id="person-meetings"
                    className="font-sans text-small font-normal tracking-normal text-muted"
                  >
                    Meetings they were in
                  </h3>
                  {person.meetings.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-2">
                      {person.meetings.map((meeting) => (
                        <li
                          key={meeting.id}
                          className="rounded-xl bg-grey-1 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            {meeting.kind === 'meeting' ? (
                              <TextLink
                                href={`${base}/meetings?meeting=${encodeURIComponent(meeting.id)}`}
                                className="text-small font-medium"
                              >
                                {meeting.title}
                              </TextLink>
                            ) : (
                              <p className="text-small font-medium">
                                {meeting.title}
                              </p>
                            )}
                            <p className="text-[0.75rem] text-muted">
                              {meeting.kind === 'notes'
                                ? `Meeting notes · ${meeting.date}`
                                : meeting.date}
                            </p>
                          </div>
                          {meeting.kind === 'meeting' &&
                            meeting.said.length > 0 && (
                              <ul className="mt-2 flex flex-col gap-1">
                                {meeting.said.map((point) => (
                                  <li
                                    key={`${point.label}-${point.text}`}
                                    className="text-small"
                                  >
                                    <span className="text-muted">
                                      {point.label}:
                                    </span>{' '}
                                    {point.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
                      {person.name} isn’t in any recorded meeting or notes.
                    </p>
                  )}
                </section>
              </div>

              <aside aria-labelledby="person-devices" className="self-start">
                <h3
                  id="person-devices"
                  className="font-sans text-small font-normal tracking-normal text-muted"
                >
                  {person.devices.length > 0
                    ? `Signs in to ${plural(person.devices.length, 'device')}`
                    : 'Devices'}
                </h3>
                {person.devices.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {person.devices.map((device) => (
                      <li
                        key={device.id}
                        className="rounded-xl bg-grey-1 p-3.5"
                      >
                        <p className="font-semibold">{device.name}</p>
                        <p className="text-[0.75rem] text-muted">{device.os}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Tag tone={device.patching.tone}>
                            {device.patching.label}
                          </Tag>
                          <Tag tone={device.online ? 'healthy' : 'neutral'}>
                            {device.online ? 'Online' : 'Offline'}
                          </Tag>
                        </div>
                        <p className="mt-2 text-[0.75rem] text-muted">
                          Last seen {device.lastSeen}
                        </p>
                        {device.remoteUrl && (
                          <ButtonAnchor
                            href={device.remoteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full"
                          >
                            Open in NinjaOne
                          </ButtonAnchor>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
                    NinjaOne hasn’t seen {person.name} sign in to a device.
                  </p>
                )}
              </aside>
            </div>
          </>
        );
      }}
    />
  );
}

/** A list in Dossier's read, each line with the record it rests on. */
function Lines({ title, lines }: { title: string; lines: ReadLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-[0.75rem] text-muted">{title}</p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {lines.map((line) => (
          <li
            key={line.text}
            className="rounded-lg bg-white/70 px-3 py-2 text-small"
          >
            {line.text}
            {line.source && (
              <>
                {' '}
                <a
                  href={line.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm text-[0.75rem] text-muted underline decoration-ink/20 underline-offset-[3px] hover:text-ink"
                >
                  {line.source.name}
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A person's tickets, the first TICKETS_SHOWN of them, each to its page; with
 * who raised each when they're someone else's.
 */
function PersonTickets({
  id,
  title,
  tickets,
  clientId,
  all,
  empty,
  showReporter = false,
}: {
  id: string;
  title: string;
  tickets: TicketRow[];
  clientId: string;
  all: string;
  empty?: string;
  showReporter?: boolean;
}) {
  const shown = tickets.slice(0, TICKETS_SHOWN);
  return (
    <section aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id={id}
          className="font-sans text-small font-normal tracking-normal text-muted"
        >
          {title}
        </h3>
        {tickets.length > TICKETS_SHOWN && (
          <TextLink href={all} className="text-small">
            All {tickets.length} on Tickets
          </TextLink>
        )}
      </div>
      {shown.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1">
          {shown.map((ticket) => (
            <li
              key={ticket.id}
              className="relative flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3 transition-colors odd:bg-grey-1 hover:bg-grey-2"
            >
              <span className="min-w-0 flex-1">
                <Link
                  href={ticketHref(clientId, ticket.number)}
                  className="rounded-sm text-small font-semibold after:absolute after:inset-0"
                >
                  #{ticket.number} {ticket.title}
                </Link>
                {showReporter && ticket.reportedBy && (
                  <span className="block text-[0.75rem] text-muted">
                    Raised by {ticket.reportedBy}
                  </span>
                )}
              </span>
              {ticket.stuck && <Tag tone="attention">Stuck</Tag>}
              <Tag tone={ticket.priority.tone}>{ticket.priority.label}</Tag>
              <span className="text-small text-muted sm:w-32 sm:text-right">
                {ticket.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
          {empty}
        </p>
      )}
    </section>
  );
}
