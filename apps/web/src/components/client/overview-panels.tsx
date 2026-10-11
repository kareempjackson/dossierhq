import { TOOL_NAMES, type Client } from '@dossierhq/contracts';
import Link from 'next/link';
import { SyncStatus } from '@/components/home/source-tiles';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { Panel } from '@/components/ui/panel';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import {
  getClientSources,
  getConnectors,
  getDevices,
  getMeetings,
  getNow,
  getSources,
  getWorkspace,
} from '@/lib/data';
import {
  daysUntil,
  formatCalendarDate,
  formatDate,
  formatMoney,
  formatRelative,
  plural,
} from '@/lib/format';
import { MeetingSummary } from './meeting-summary';

const panelLink =
  'rounded-row underline-offset-2 hover:text-ink hover:underline';

export async function LastMeetingPanel({ clientId }: { clientId: string }) {
  const [meetings, workspace] = await Promise.all([
    getMeetings({ clientId }).catch(() => null),
    getWorkspace(),
  ]);
  const meeting = meetings?.[0];
  const sources = meeting
    ? await getSources([
        meeting.recordingSourceId,
        ...[
          ...meeting.planning,
          ...meeting.concerns,
          ...meeting.askedFor,
        ].flatMap((point) => point.sourceIds),
      ]).catch(() => [])
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const recording = meeting && sourceById.get(meeting.recordingSourceId);

  return (
    <Panel
      id="last-meeting-heading"
      title="Last meeting"
      note={
        meetings && meetings.length > 1 ? (
          <Link href={`/clients/${clientId}/meetings`} className={panelLink}>
            All {meetings.length}
          </Link>
        ) : undefined
      }
    >
      {meetings === null ? (
        <ErrorState what="meetings" />
      ) : !meeting ? (
        <p className="text-meta text-muted">
          No meetings recorded yet. Fathom recordings appear here after each
          call.
        </p>
      ) : (
        <>
          <p className="font-medium text-ink">{meeting.title}</p>
          <p className="text-meta text-muted">
            {formatDate(meeting.occurredAt, workspace.timeZone)} ·{' '}
            {meeting.durationMinutes} min ·{' '}
            {meeting.attendees.map((a) => a.name).join(', ')}
          </p>
          <MeetingSummary
            meeting={meeting}
            sourceById={sourceById}
            className="mt-4"
          />
          {recording && (
            <a
              href={recording.url}
              target="_blank"
              rel="noreferrer"
              className={`mt-4 inline-block text-meta text-muted ${panelLink}`}
            >
              Open recording in Fathom
            </a>
          )}
        </>
      )}
    </Panel>
  );
}

export async function DevicesPanel({ clientId }: { clientId: string }) {
  const [devices, now, workspace] = await Promise.all([
    getDevices({ clientId }).catch(() => null),
    getNow(),
    getWorkspace(),
  ]);
  const stale = (iso: string) =>
    new Date(now).getTime() - new Date(iso).getTime() > 3 * 86_400_000;
  const needsWork =
    devices?.filter(
      (d) => d.patchStatus !== 'current' || stale(d.lastSeenAt),
    ) ?? [];
  const count = (status: string) =>
    devices?.filter((d) => d.patchStatus === status).length ?? 0;

  return (
    <Panel
      id="devices-heading"
      title="Devices"
      note={
        devices && devices.length > 0 ? (
          <Link href={`/clients/${clientId}/devices`} className={panelLink}>
            All {devices.length}
          </Link>
        ) : undefined
      }
    >
      {devices === null ? (
        <ErrorState what="devices" />
      ) : devices.length === 0 ? (
        <p className="text-meta text-muted">
          No devices yet. They appear once NinjaOne reports them.
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-text">
            <li>
              <StatusDot
                tone="positive"
                label={`${count('current')} patched`}
              />
            </li>
            {count('pending') > 0 && (
              <li>
                <StatusDot
                  tone="neutral"
                  label={`${count('pending')} pending`}
                />
              </li>
            )}
            {count('failed') > 0 && (
              <li>
                <StatusDot tone="failure" label={`${count('failed')} failed`} />
              </li>
            )}
          </ul>
          {needsWork.length > 0 && (
            <ul className="mt-3 flex flex-col divide-y divide-hairline">
              {needsWork.slice(0, 4).map((device) => (
                <li
                  key={device.id}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <span className="font-mono text-mono text-ink">
                    {device.name}
                  </span>
                  <span className="text-right text-meta-sm text-muted">
                    {stale(device.lastSeenAt)
                      ? `Last seen ${formatRelative(device.lastSeenAt, now, workspace.timeZone)}`
                      : device.patchStatus === 'failed'
                        ? 'Patching failed'
                        : 'Patch pending'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

export async function ContractPanel({ client }: { client: Client }) {
  const now = await getNow();
  const { contract } = client;
  const days = daysUntil(contract.renewsOn, now);

  return (
    <Panel id="contract-heading" title="Contract">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-meta">
        <dt className="text-muted">Plan</dt>
        <dd className="text-ink">{contract.plan}</dd>
        <dt className="text-muted">Fee</dt>
        <dd className="text-ink">
          {formatMoney(contract.monthlyFee, contract.currency)} a month
        </dd>
        <dt className="text-muted">Started</dt>
        <dd className="text-ink">{formatCalendarDate(contract.startedOn)}</dd>
        <dt className="text-muted">Renews</dt>
        <dd className="text-ink">
          {formatCalendarDate(contract.renewsOn)}
          <span className={days <= 60 ? 'font-medium' : 'text-muted'}>
            {' '}
            ·{' '}
            {days >= 0
              ? `in ${plural(days, 'day')}`
              : `${plural(-days, 'day')} ago`}
          </span>
        </dd>
      </dl>
      <p className="mt-3 text-meta-sm font-medium text-muted">Includes</p>
      <ul className="mt-1 flex flex-col gap-0.5 text-meta text-text">
        {contract.includes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Panel>
  );
}

export async function ClientSourcesPanel({ clientId }: { clientId: string }) {
  const [connectors, sources, devices, workspace, now] = await Promise.all([
    getConnectors().catch(() => null),
    getClientSources(clientId).catch(() => []),
    getDevices({ clientId }).catch(() => []),
    getWorkspace(),
    getNow(),
  ]);

  return (
    <Panel
      id="client-sources-heading"
      title="Sources"
      note={
        <Link href="/connections" className={panelLink}>
          Manage
        </Link>
      }
    >
      {connectors === null ? (
        <ErrorState what="sources" />
      ) : connectors.length === 0 ? (
        <p className="text-meta text-muted">No tools connected yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {connectors.map((connector) => {
            const records =
              sources.filter((s) => s.tool === connector.tool).length +
              (connector.tool === 'ninjaone' ? devices.length : 0);
            return (
              <li key={connector.id} className="flex items-start gap-3">
                <ConnectorTile tool={connector.tool} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-meta">
                    <span className="font-medium text-ink">
                      {TOOL_NAMES[connector.tool]}
                    </span>
                    <span className="text-meta-sm text-muted">
                      {plural(records, 'record')}
                    </span>
                  </p>
                  <SyncStatus
                    connector={connector}
                    now={now}
                    timeZone={workspace.timeZone}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function PanelSkeleton({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-sheet p-4 shadow-card">
      <p className="text-section font-semibold text-ink">{title}</p>
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
