import {
  TOOL_NAMES,
  toolSchema,
  type Connector,
  type Tool,
} from '@dossierhq/contracts';
import { Suspense } from 'react';
import { ConnectorRow } from '@/components/connections/connector-row';
import { FailureNotice } from '@/components/connections/failure-notice';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedFilter } from '@/components/ui/segmented-filter';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import type { StatusTone } from '@/components/ui/status-dot';
import {
  getAuditLog,
  getClients,
  getConnectors,
  getNow,
  getWorkspace,
} from '@/lib/data';
import {
  formatDateTime,
  formatRelative,
  formatTime,
  formatTimestamp,
  plural,
} from '@/lib/format';
import { orEmpty, orNull } from '@/lib/data/safe';

export const metadata = { title: 'Connections' };

export default function ConnectionsPage({
  searchParams,
}: PageProps<'/connections'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-220 flex-col gap-12">
        <header>
          <h1 className="text-title-compact sm:text-title">Connections</h1>
          <p className="mt-3 max-w-2xl text-text">
            Dossier only reads from your tools. It never creates, changes or
            deletes anything in them, and every read is listed in the audit log
            below.
          </p>
        </header>

        <Suspense fallback={<ConnectorsSkeleton />}>
          <Connectors />
        </Suspense>

        <section
          id="audit-log"
          aria-labelledby="audit-log-heading"
          className="scroll-mt-6"
        >
          <SectionHeader
            id="audit-log-heading"
            title="Audit log"
            note="Every read in the last two hours, newest first"
          />
          <Suspense fallback={<AuditSkeleton />}>
            <AuditLog searchParams={searchParams} />
          </Suspense>
        </section>
      </div>
    </Sheet>
  );
}

function statusOf(
  connector: Connector,
  now: string,
  timeZone: string,
): { tone: StatusTone; label: string } {
  if (connector.status === 'failing') {
    return {
      tone: 'failure',
      label: `Failing since ${formatDateTime(connector.failure?.since ?? connector.lastSyncAt, timeZone)}`,
    };
  }
  if (connector.status === 'syncing')
    return { tone: 'neutral', label: 'Syncing now' };
  return {
    tone: 'positive',
    label: `Synced ${formatRelative(connector.lastSyncAt, now, timeZone)}`,
  };
}

async function Connectors() {
  const [connectors, log, workspace, now] = await Promise.all([
    getConnectors().catch(orNull),
    getAuditLog().catch(orEmpty),
    getWorkspace(),
    getNow(),
  ]);
  const tz = workspace.timeZone;
  const failing =
    connectors?.filter((c) => c.status === 'failing' && c.failure) ?? [];

  return (
    <>
      {failing.map((connector) => (
        <FailureNotice
          key={connector.id}
          tool={connector.tool}
          name={TOOL_NAMES[connector.tool]}
          summary={connector.failure!.summary}
          fix={connector.failure!.fix}
          detail={`Failing since ${formatTimestamp(connector.failure!.since, tz)} · last good sync ${formatTimestamp(connector.lastSyncAt, tz)}`}
        />
      ))}

      <section aria-labelledby="connectors-heading">
        <SectionHeader
          id="connectors-heading"
          title="Connected tools"
          count={connectors?.length || undefined}
          note="Read only"
        />
        <div className="mt-3">
          {connectors === null ? (
            <ErrorState what="your connections" />
          ) : connectors.length === 0 ? (
            <EmptyState title="No tools connected yet.">
              Connect NinjaOne, Hudu, SharePoint or Fathom with a read-only key
              to start.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-hairline rounded-card bg-sheet shadow-card">
              {connectors.map((connector) => {
                const reads = log.filter(
                  (entry) => entry.tool === connector.tool,
                );
                const records = reads.reduce(
                  (sum, e) => sum + e.recordCount,
                  0,
                );
                const name = TOOL_NAMES[connector.tool];
                return (
                  <ConnectorRow
                    key={connector.id}
                    tool={connector.tool}
                    name={name}
                    scope={connector.scope}
                    access={connector.access}
                    status={statusOf(connector, now, tz)}
                    details={[
                      {
                        label: 'Access',
                        value: `Read only. Dossier never writes to ${name}.`,
                      },
                      { label: 'Checks', value: 'Every 15 minutes' },
                      {
                        label: 'Last two hours',
                        value: `${plural(reads.length, 'read')}, ${plural(records, 'record')}`,
                      },
                      {
                        label: 'Last good sync',
                        value: formatTimestamp(connector.lastSyncAt, tz),
                      },
                      {
                        label: 'To change access',
                        value: `Edit the key’s permissions in ${name}.`,
                      },
                    ]}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

async function AuditLog({
  searchParams,
}: Pick<PageProps<'/connections'>, 'searchParams'>) {
  const parsed = toolSchema.safeParse((await searchParams).tool);
  const tool: Tool | undefined = parsed.success ? parsed.data : undefined;
  const [log, clients, workspace] = await Promise.all([
    getAuditLog().catch(orNull),
    getClients().catch(orEmpty),
    getWorkspace(),
  ]);
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const entries = log?.filter((entry) => !tool || entry.tool === tool) ?? [];
  const tools = toolSchema.options;

  return (
    <div className="mt-3">
      <SegmentedFilter
        label="Filter the audit log by tool"
        value={tool ?? 'all'}
        options={[
          {
            value: 'all',
            label: 'All',
            href: '/connections#audit-log',
            count: log?.length,
          },
          ...tools.map((t) => ({
            value: t,
            label: TOOL_NAMES[t],
            href: `/connections?tool=${t}#audit-log`,
            count: log?.filter((entry) => entry.tool === t).length,
          })),
        ]}
      />
      <div className="mt-3">
        {log === null ? (
          <ErrorState what="the audit log" />
        ) : entries.length === 0 ? (
          <EmptyState title="No reads yet.">
            {tool
              ? `Dossier hasn’t read anything from ${TOOL_NAMES[tool]} in the last two hours.`
              : 'Reads appear here as soon as a tool is connected.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-card bg-sheet shadow-card">
            <table className="w-full min-w-170 text-left">
              <caption className="sr-only">
                Reads Dossier made{tool ? ` from ${TOOL_NAMES[tool]}` : ''},
                newest first
              </caption>
              <thead className="text-meta text-muted">
                <tr className="border-b border-hairline">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Time
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Tool
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    What was read
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Client
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-right font-medium"
                  >
                    Records
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-2.5 font-mono text-mono whitespace-nowrap text-muted">
                      <time
                        dateTime={entry.at}
                        title={formatTimestamp(entry.at, workspace.timeZone)}
                      >
                        {formatTime(entry.at, workspace.timeZone)}
                      </time>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <ConnectorTile tool={entry.tool} size="sm" />
                        {TOOL_NAMES[entry.tool]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text">{entry.read}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {entry.clientId
                        ? (clientName.get(entry.clientId) ?? entry.clientId)
                        : 'All clients'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text">
                      {entry.recordCount.toLocaleString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectorsSkeleton() {
  return (
    <div>
      <LoadingLabel what="connections" />
      <div className="flex flex-col divide-y divide-hairline rounded-card bg-sheet shadow-card">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-4">
            <Skeleton className="size-9 rounded-input" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="mt-3">
      <LoadingLabel what="the audit log" />
      <Skeleton className="h-9 w-80 max-w-full rounded-full" />
      <div className="mt-3 flex flex-col gap-3 rounded-card bg-sheet p-4 shadow-card">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
