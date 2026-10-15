import { TOOL_NAMES, type Connector } from '@dossierhq/contracts';
import Link from 'next/link';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { SectionHeader } from '@/components/ui/section-header';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import { getConnectors, getNow, getWorkspace } from '@/lib/data';
import { cn } from '@/lib/cn';
import { orNull } from '@/lib/data/safe';
import { connectorStatus } from '@/lib/connectors';

const headingId = 'sources-heading';

const manageLink = (
  <Link
    href="/connections"
    className="rounded-row underline-offset-2 hover:text-ink hover:underline"
  >
    Manage connections
  </Link>
);

/** The tools Dossier reads from, and whether each one is syncing. */
export async function SourceTiles() {
  const [connectors, workspace, now] = await Promise.all([
    getConnectors().catch(orNull),
    getWorkspace(),
    getNow(),
  ]);

  return (
    <section aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="Sources" note={manageLink} />
      <div className="mt-3">
        {connectors === null ? (
          <ErrorState what="your connections" />
        ) : connectors.length === 0 ? (
          <EmptyState title="No tools connected yet.">
            Connect NinjaOne, Hudu, SharePoint or Fathom so Dossier has
            something to read.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
            {connectors.map((connector) => (
              <li key={connector.id}>
                <Link
                  href="/connections"
                  className="flex h-full flex-col gap-3 rounded-card bg-sheet p-4 shadow-card transition-colors hover:bg-surface-soft"
                >
                  <span className="flex items-center gap-3">
                    <ConnectorTile tool={connector.tool} />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">
                        {TOOL_NAMES[connector.tool]}
                      </span>
                      <span className="block truncate text-meta-sm text-muted">
                        {connector.scope.split(' · ')[0]}
                      </span>
                    </span>
                  </span>
                  <SyncStatus
                    connector={connector}
                    now={now}
                    timeZone={workspace.timeZone}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function SyncStatus({
  connector,
  now,
  timeZone,
}: {
  connector: Connector;
  now: string;
  timeZone: string;
}) {
  const { tone, label } = connectorStatus(connector, now, timeZone);
  return (
    <StatusDot
      tone={tone}
      label={label}
      className={cn('text-meta', tone === 'failure' ? 'text-ink' : 'text-text')}
    />
  );
}

export function SourceTilesSkeleton() {
  return (
    <section aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="Sources" note={manageLink} />
      <LoadingLabel what="your connections" />
      <ul className="mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <li
            key={tile}
            className="flex flex-col gap-3 rounded-card bg-sheet p-4 shadow-card"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-input" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-3 w-28" />
          </li>
        ))}
      </ul>
    </section>
  );
}
