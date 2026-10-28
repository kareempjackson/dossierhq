import { TOOL_NAMES, toolSchema } from '@dossierhq/contracts';
import Link from 'next/link';
import { Suspense } from 'react';
import { ToolList, type ToolEntry } from '@/components/connections/tool-list';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingLabel, Skeleton } from '@/components/ui/states';
import { connectorStatus } from '@/lib/connectors';
import {
  getAuditLog,
  getConnectors,
  getMe,
  getNow,
  getWorkspace,
} from '@/lib/data';
import { formatTimestamp, plural } from '@/lib/format';
import { orEmpty, orNull } from '@/lib/data/safe';
import { ninjaOneRedirectUri, readProblem } from '@/lib/ninjaone-sign-in';

export const metadata = { title: 'Connections' };

export default function ConnectionsPage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-220 flex-col gap-12">
        <header>
          <h1 className="text-title-compact sm:text-title">Connections</h1>
          <p className="mt-3 max-w-2xl text-text">
            Dossier only reads from your tools. It never creates, changes or
            deletes anything in them, and every read is listed in the{' '}
            <Link href="/audit-log" className="underline underline-offset-2">
              audit log
            </Link>
            .
          </p>
        </header>

        <Suspense fallback={<ConnectorsSkeleton />}>
          <Connectors />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function Connectors() {
  const [connectors, log, workspace, now, me, redirectUri, problem] =
    await Promise.all([
      getConnectors().catch(orNull),
      getAuditLog().catch(orEmpty),
      getWorkspace(),
      getNow(),
      getMe().catch(orNull),
      ninjaOneRedirectUri(),
      readProblem(),
    ]);
  if (connectors === null) return <ErrorState what="your connections" />;
  const tz = workspace.timeZone;

  const tools = toolSchema.options.map((tool): ToolEntry => {
    const name = TOOL_NAMES[tool];
    const connector = connectors.find((c) => c.tool === tool);
    if (!connector) return { tool, name, connector: null };

    const reads = log.filter((entry) => entry.tool === tool);
    const records = reads.reduce((sum, e) => sum + e.recordCount, 0);
    const lastGood = connector.lastSyncAt
      ? formatTimestamp(connector.lastSyncAt, tz)
      : null;
    return {
      tool,
      name,
      connector: {
        account: connector.account,
        scope: connector.scope,
        access: connector.access,
        status: connectorStatus(connector, now, tz),
        syncing: connector.status === 'syncing',
        failure: connector.failure && {
          summary: connector.failure.summary,
          fix: connector.failure.fix,
          detail: `Failing since ${formatTimestamp(connector.failure.since, tz)} · ${lastGood ? `last good sync ${lastGood}` : 'no good sync yet'}`,
        },
        details: [
          { label: 'Reads', value: connector.access.replace(/^read: /, '') },
          {
            label: 'Access',
            value: `Read only. Dossier never writes to ${name}.`,
          },
          { label: 'Checks', value: 'Every 15 minutes, and when you sync now' },
          {
            label: 'Recent reads',
            value: `${plural(reads.length, 'read')}, ${plural(records, 'record')}`,
          },
          { label: 'Last good sync', value: lastGood ?? 'Not yet' },
        ],
      },
    };
  });

  return (
    <ToolList
      tools={tools}
      canManage={me?.role === 'owner'}
      signIn={{ redirectUri, problem }}
    />
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
