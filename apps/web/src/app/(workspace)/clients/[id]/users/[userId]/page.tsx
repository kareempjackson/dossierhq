import type {
  Device,
  EndUserDetail,
  EndUserMeeting,
  Source,
  Ticket,
} from '@dossierhq/contracts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AttentionSection } from '@/components/attention/attention-section';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { hasPoints, MeetingSummary } from '@/components/client/meeting-summary';
import { Avatar } from '@/components/ui/avatar';
import { ListCard, ListCardRow } from '@/components/ui/list-card';
import { Panel } from '@/components/ui/panel';
import { SectionHeader } from '@/components/ui/section-header';
import { EmptyState } from '@/components/ui/states';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import {
  getClient,
  getEndUser,
  getNow,
  getSources,
  getWorkspace,
} from '@/lib/data';
import {
  formatCalendarDate,
  formatDate,
  formatList,
  formatRelative,
  plural,
} from '@/lib/format';
import { orEmpty, orNull } from '@/lib/data/safe';

/** Enough to see what's going on; the Tickets tab has the rest. */
const TICKETS_SHOWN = 8;

const urgency: Record<
  Ticket['urgency'],
  { tone: StatusTone; label: string | null }
> = {
  critical: { tone: 'failure', label: 'Critical' },
  high: { tone: 'strong', label: 'High priority' },
  normal: { tone: 'neutral', label: null },
};

const patch: Record<
  Device['patchStatus'],
  { tone: StatusTone; label: string }
> = {
  failed: { tone: 'failure', label: 'Patching failed' },
  pending: { tone: 'neutral', label: 'Patch pending' },
  current: { tone: 'positive', label: 'Up to date' },
};

const panelLink =
  'rounded-row underline-offset-2 hover:text-ink hover:underline';

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/users/[userId]'>) {
  const { id, userId } = await params;
  const [client, detail] = await Promise.all([
    getClient(id).catch(orNull),
    getEndUser(id, userId).catch(orNull),
  ]);
  return {
    title: client && detail ? `${detail.user.name} at ${client.name}` : 'User',
  };
}

export default function UserPage({
  params,
}: PageProps<'/clients/[id]/users/[userId]'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <User params={params} />
    </Suspense>
  );
}

async function User({
  params,
}: Pick<PageProps<'/clients/[id]/users/[userId]'>, 'params'>) {
  const client = await loadClient(params);
  const { userId } = await params;
  const [detail, now, workspace] = await Promise.all([
    getEndUser(client.id, userId),
    getNow(),
    getWorkspace(),
  ]);
  if (!detail) notFound();

  const { user } = detail;
  const shown = detail.tickets.slice(0, TICKETS_SHOWN);
  const said = detail.meetings.flatMap((meeting) =>
    meeting.kind === 'meeting'
      ? [
          ...meeting.said.planning,
          ...meeting.said.concerns,
          ...meeting.said.askedFor,
        ].flatMap((point) => point.sourceIds)
      : [],
  );
  // The moments in each recording their words came from.
  const sources = await getSources(said).catch(orEmpty);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const facts = [user.role, user.primaryContact ? 'Primary contact' : null]
    .filter(Boolean)
    .join(' · ');
  const base = `/clients/${client.id}`;
  // The Devices and Tickets tabs find them by how the tool spells them.
  const requester = detail.tickets[0]?.requester;
  const signIn = detail.devices[0]?.assignedTo;

  return (
    <ClientSheet
      client={client}
      tab="users"
      trail={[{ label: 'Users', href: `${base}/users` }, { label: user.name }]}
    >
      <div className="flex items-center gap-4">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0">
          <h2 className="text-title-compact">{user.name}</h2>
          {facts && <p className="mt-1 text-meta text-muted">{facts}</p>}
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-10">
          {detail.attention.length > 0 && (
            <AttentionSection clientId={client.id} items={detail.attention} />
          )}

          <section aria-labelledby="user-tickets-heading">
            <SectionHeader
              id="user-tickets-heading"
              title="Tickets raised"
              count={detail.tickets.length || undefined}
              note={
                detail.tickets.length > TICKETS_SHOWN && requester ? (
                  <Link
                    href={`${base}/tickets?q=${encodeURIComponent(requester)}`}
                    className={panelLink}
                  >
                    All {detail.tickets.length}
                  </Link>
                ) : detail.tickets.length > 1 ? (
                  'Open first'
                ) : undefined
              }
            />
            <div className="mt-3">
              {detail.tickets.length === 0 ? (
                <EmptyState title="No tickets.">
                  Tickets {user.name} raises appear here once NinjaOne reports
                  them.
                </EmptyState>
              ) : (
                <ListCard>
                  {shown.map((ticket) => (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      now={now}
                      timeZone={workspace.timeZone}
                    />
                  ))}
                </ListCard>
              )}
            </div>
          </section>

          <section aria-labelledby="user-meetings-heading">
            <SectionHeader
              id="user-meetings-heading"
              title="Meetings"
              count={detail.meetings.length || undefined}
              note={
                detail.meetings.some(
                  (m) => m.kind === 'meeting' && hasPoints(m.said),
                )
                  ? 'What they said, from the recording'
                  : undefined
              }
            />
            <div className="mt-3">
              {detail.meetings.length === 0 ? (
                <EmptyState title="No meetings.">
                  Fathom recordings and notes that {user.name} is in appear
                  here.
                </EmptyState>
              ) : (
                <ListCard>
                  {detail.meetings.map((meeting) => (
                    <MeetingRow
                      key={meeting.id}
                      meeting={meeting}
                      href={`${base}/meetings#${meeting.kind === 'meeting' ? `${meeting.id}-title` : meeting.id}`}
                      sourceById={sourceById}
                      timeZone={workspace.timeZone}
                    />
                  ))}
                </ListCard>
              )}
            </div>
          </section>
        </div>

        <aside aria-label="About this user" className="flex flex-col gap-4">
          <AboutPanel detail={detail} now={now} timeZone={workspace.timeZone} />
          <DevicesPanel
            devices={detail.devices}
            href={
              signIn
                ? `${base}/devices?q=${encodeURIComponent(signIn)}`
                : `${base}/devices`
            }
            now={now}
            timeZone={workspace.timeZone}
          />
        </aside>
      </div>
    </ClientSheet>
  );
}

function TicketRow({
  ticket,
  now,
  timeZone,
}: {
  ticket: Ticket;
  now: string;
  timeZone: string;
}) {
  const level = urgency[ticket.urgency];
  return (
    <ListCardRow>
      <StatusDot
        tone={ticket.open ? level.tone : 'positive'}
        decorative
        className="mt-[7px] self-start"
      />
      <div className="min-w-0 flex-1">
        <p className="text-ink">
          <span className="mr-2 font-mono text-mono text-muted">
            #{ticket.number}
          </span>
          <Link
            href={`/clients/${ticket.clientId}/tickets/${ticket.id}`}
            className="rounded-row underline-offset-2 hover:underline"
          >
            {ticket.subject}
          </Link>
        </p>
        <p className="mt-0.5 text-meta text-muted">
          {[
            ticket.status,
            ticket.open ? level.label : null,
            `updated ${formatRelative(ticket.updatedAt, now, timeZone)}`,
            ticket.assignedTo && `assigned to ${ticket.assignedTo}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </ListCardRow>
  );
}

function MeetingRow({
  meeting,
  href,
  sourceById,
  timeZone,
}: {
  meeting: EndUserMeeting;
  href: string;
  sourceById: Map<string, Source>;
  timeZone: string;
}) {
  return (
    <ListCardRow>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Link
            href={href}
            className="rounded-row font-medium text-ink underline-offset-2 hover:underline"
          >
            {meeting.title}
          </Link>
          <p className="text-meta text-muted">
            {meeting.kind === 'meeting'
              ? formatDate(meeting.occurredAt, timeZone)
              : `${formatCalendarDate(meeting.occurredOn)} · Notes`}
          </p>
        </div>
        {meeting.kind === 'meeting' && hasPoints(meeting.said) && (
          <MeetingSummary
            points={meeting.said}
            sourceById={sourceById}
            className="mt-3"
          />
        )}
      </div>
    </ListCardRow>
  );
}

function AboutPanel({
  detail,
  now,
  timeZone,
}: {
  detail: EndUserDetail;
  now: string;
  timeZone: string;
}) {
  const { user } = detail;
  const knownFrom = [
    user.deviceIds.length > 0 && plural(user.deviceIds.length, 'device'),
    user.tickets > 0 && plural(user.tickets, 'ticket'),
    user.meetings > 0 && plural(user.meetings, 'meeting'),
    user.primaryContact && 'the client’s details',
  ].filter((part): part is string => Boolean(part));

  return (
    <Panel id="user-about-heading" title="About">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-meta">
        {user.email && (
          <>
            <dt className="text-muted">Email</dt>
            <dd className="min-w-0 break-words">
              <a
                href={`mailto:${user.email}`}
                className="rounded-row text-ink underline-offset-2 hover:underline"
              >
                {user.email}
              </a>
            </dd>
          </>
        )}
        {user.signIns.length > 0 && (
          <>
            <dt className="text-muted">Signs in as</dt>
            <dd className="min-w-0 font-mono text-mono break-words text-ink">
              {user.signIns.join(', ')}
            </dd>
          </>
        )}
        <dt className="text-muted">Last contact</dt>
        <dd className="text-ink">
          {user.lastContactAt
            ? formatRelative(user.lastContactAt, now, timeZone)
            : 'None yet'}
        </dd>
      </dl>
      <p className="mt-3 text-meta-sm text-muted">
        Known from {formatList(knownFrom)}. No tool lists who works at a client,
        so Dossier matches the names the tools use.
      </p>
    </Panel>
  );
}

function DevicesPanel({
  devices,
  href,
  now,
  timeZone,
}: {
  devices: Device[];
  href: string;
  now: string;
  timeZone: string;
}) {
  return (
    <Panel
      id="user-devices-heading"
      title="Devices"
      note={
        devices.length > 0 ? (
          <Link href={href} className={panelLink}>
            On the Devices tab
          </Link>
        ) : undefined
      }
    >
      {devices.length === 0 ? (
        <p className="text-meta text-muted">
          None. NinjaOne hasn’t seen them sign in to a device.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {devices.map((device) => (
            <li key={device.id} className="py-2 first:pt-0 last:pb-0">
              <p className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-mono text-ink">
                  {device.name}
                </span>
                <StatusDot
                  tone={patch[device.patchStatus].tone}
                  label={patch[device.patchStatus].label}
                  className="text-meta-sm text-muted"
                />
              </p>
              <p className="text-meta-sm text-muted">
                {device.os} · seen{' '}
                {formatRelative(device.lastSeenAt, now, timeZone)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
