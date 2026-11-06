import { hasRole } from '@dossierhq/contracts';
import { Suspense, type ReactNode } from 'react';
import { ConnectionsSync } from '@/components/connections/connections-sync';
import { RefreshWhileSyncing } from '@/components/connections/refresh-while-syncing';
import { toolStatuses } from '@/lib/connector-status';
import { getAuditCounts } from '@/lib/data/audit';
import { getMe } from '@/lib/data/auth';
import { getConnectors } from '@/lib/data/connectors';
import { orNull } from '@/lib/data/safe';
import { ninjaOneRedirectUri, readProblem } from '@/lib/ninjaone-sign-in';
import type { ConnectionsData } from '@/lib/store/connections-slice';

/**
 * Every Connections page. The tools' state is read here, once, and handed
 * to the browser's store, so the list and each tool draw from it: moving
 * between them needs no new request, and a refresh updates them in place.
 * The pages themselves are static around it.
 */
export default function ConnectionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <LoadConnections />
      </Suspense>
      {children}
    </>
  );
}

async function LoadConnections() {
  const [connectors, me, counts, signInProblem, redirectUri] =
    await Promise.all([
      getConnectors().catch(orNull),
      getMe().catch(orNull),
      getAuditCounts().catch(orNull),
      readProblem(),
      ninjaOneRedirectUri(),
    ]);
  if (!connectors || !me) return <ConnectionsSync data={null} />;

  const tools = toolStatuses(connectors, new Date(), me.workspace.timeZone);
  const data: ConnectionsData = {
    tools,
    canManage: hasRole(me.role, 'admin'),
    recentReads: Object.fromEntries(
      (counts ?? [])
        .filter((count) => count.kind === 'read' && count.tool)
        .map((count) => [count.tool, count.count]),
    ),
    redirectUri,
    signInProblem,
  };
  return (
    <>
      <ConnectionsSync data={data} />
      <RefreshWhileSyncing syncing={tools.some((tool) => tool.syncing)} />
    </>
  );
}
