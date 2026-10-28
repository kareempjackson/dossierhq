import {
  hasRole,
  TOOL_NAMES,
  toolSchema,
  type AuditCount,
  type AuditEntry,
  type AuditKind,
  type AuditPage,
  type Tool,
} from '@dossierhq/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { SegmentedFilter } from '@/components/ui/segmented-filter';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import {
  getAuditCounts,
  getAuditPage,
  getClients,
  getMe,
  getWorkspace,
} from '@/lib/data';
import { formatDateTime, formatTimestamp } from '@/lib/format';
import { orEmpty, orNull } from '@/lib/data/safe';

export const metadata = { title: 'Audit log' };

export default function AuditLogPage({
  searchParams,
}: PageProps<'/audit-log'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <header>
          <h1 className="text-title-compact sm:text-title">Audit log</h1>
          <p className="mt-3 max-w-2xl text-text">
            Everything Dossier read from your{' '}
            <Link href="/connections" className="underline underline-offset-2">
              connected tools
            </Link>
            , every sign-in, and every change people made, newest first. Reads
            are kept for 90 days; sign-ins and changes for a year.
          </p>
        </header>
        <Suspense fallback={<AuditSkeleton />}>
          <AuditLog searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

/**
 * What the log shows: everything, sign-ins, changes, or one tool's reads.
 * In the URL as `?kind=` or `?tool=`.
 */
type Filter = { kind?: Exclude<AuditKind, 'read'>; tool?: Tool };

/** The audit log's URL for a filter and a page. */
function auditHref({
  kind,
  tool,
  before,
  after,
}: Filter & { before?: string; after?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ kind, tool, before, after })) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `/audit-log?${search}` : '/audit-log';
}

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

const countOf = (
  counts: AuditCount[] | null,
  keep: (count: AuditCount) => boolean,
) => counts?.filter(keep).reduce((sum, c) => sum + c.count, 0);

async function AuditLog({
  searchParams,
}: Pick<PageProps<'/audit-log'>, 'searchParams'>) {
  const query = await searchParams;
  const me = await getMe().catch(orNull);
  // Technicians see reads from tools; sign-ins and changes are for admins.
  const everything = hasRole(me?.role, 'admin');
  const parsedTool = toolSchema.safeParse(query.tool);
  const tool = parsedTool.success ? parsedTool.data : undefined;
  const asked = one(query.kind);
  const kind =
    everything && !tool && (asked === 'sign-in' || asked === 'change')
      ? asked
      : undefined;
  const filter: Filter = { kind, tool };
  const before = one(query.before);
  const after = one(query.after);

  const [page, counts, clients, workspace] = await Promise.all([
    getAuditPage({
      kind: tool ? 'read' : (kind ?? (everything ? undefined : 'read')),
      tool,
      before,
      after,
    }).catch(orNull),
    getAuditCounts().catch(orNull),
    getClients().catch(orEmpty),
    getWorkspace(),
  ]);
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const entries = page?.data ?? [];
  const value = tool ?? kind ?? 'all';

  return (
    <div className="mt-8">
      <SegmentedFilter
        label="Filter the audit log"
        value={value}
        options={[
          {
            value: 'all',
            label: everything ? 'All' : 'All reads',
            href: auditHref({}),
            count: countOf(counts, () => true),
          },
          ...(everything
            ? (['sign-in', 'change'] as const).map((k) => ({
                value: k,
                label: k === 'sign-in' ? 'Sign-ins' : 'Changes',
                href: auditHref({ kind: k }),
                count: countOf(counts, (c) => c.kind === k),
              }))
            : []),
          ...toolSchema.options.map((t) => ({
            value: t,
            label: TOOL_NAMES[t],
            href: auditHref({ tool: t }),
            count: countOf(counts, (c) => c.kind === 'read' && c.tool === t),
          })),
        ]}
      />
      {!everything && (
        <p className="mt-3 text-meta text-muted">
          Sign-ins and the changes people make are shown to owners and admins.
        </p>
      )}
      <div className="mt-3">
        {page === null ? (
          <ErrorState what="the audit log" />
        ) : entries.length === 0 ? (
          <EmptyState title={before ? 'Nothing older.' : 'Nothing yet.'}>
            {before
              ? 'Reads are kept for 90 days; sign-ins and changes for a year.'
              : tool
                ? `Dossier hasn’t read anything from ${TOOL_NAMES[tool]} yet.`
                : kind === 'change'
                  ? 'Changes appear here as people make them.'
                  : 'Entries appear here as soon as a tool is connected.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-card bg-sheet shadow-card">
            <table className="w-full min-w-190 text-left">
              <caption className="sr-only">
                The audit log
                {tool ? `: reads from ${TOOL_NAMES[tool]}` : ''}, newest first
              </caption>
              <thead className="text-meta text-muted">
                <tr className="border-b border-hairline">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Time
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Who
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    What
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
                  <Row
                    key={entry.id}
                    entry={entry}
                    client={
                      entry.clientId
                        ? (clientName.get(entry.clientId) ?? entry.clientId)
                        : null
                    }
                    timeZone={workspace.timeZone}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page && <Pager page={page} filter={filter} />}
      </div>
    </div>
  );
}

function Row({
  entry,
  client,
  timeZone,
}: {
  entry: AuditEntry;
  client: string | null;
  timeZone: string;
}) {
  return (
    <tr>
      <td className="px-4 py-2.5 font-mono text-mono whitespace-nowrap text-muted">
        <time dateTime={entry.at} title={formatTimestamp(entry.at, timeZone)}>
          {formatDateTime(entry.at, timeZone)}
        </time>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-text">
        {entry.actor ? (
          <span title={entry.actor.email}>{entry.actor.name}</span>
        ) : (
          <span className="text-muted">Dossier</span>
        )}
        {entry.ip && (
          <span className="block font-mono text-mono text-muted">
            <span className="sr-only">from </span>
            {entry.ip}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-text">
        <span className="flex items-center gap-2">
          {entry.tool && (
            <ConnectorTile tool={entry.tool} size="sm" className="shrink-0" />
          )}
          <span>
            {entry.what}
            {entry.tool && (
              <span className="sr-only"> ({TOOL_NAMES[entry.tool]})</span>
            )}
          </span>
        </span>
        {entry.outcome === 'failed' && (
          <StatusDot
            tone="failure"
            label="Failed"
            className="mt-1 text-meta-sm text-muted"
          />
        )}
      </td>
      <td className="px-4 py-2.5 text-muted">{client ?? 'All clients'}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-text">
        {entry.kind === 'read' ? (
          entry.recordCount.toLocaleString('en-GB')
        ) : (
          <span className="text-muted">–</span>
        )}
      </td>
    </tr>
  );
}

/** Newer and Older, with the end the reader is at shown but unavailable. */
function Pager({ page, filter }: { page: AuditPage; filter: Filter }) {
  if (!page.newer && !page.older) return null;
  return (
    <nav
      aria-label="Audit log pages"
      className="mt-4 flex items-center justify-between gap-3"
    >
      <PageLink
        href={page.newer && auditHref({ ...filter, after: page.newer })}
      >
        <ChevronLeft aria-hidden strokeWidth={1.75} />
        Newer
      </PageLink>
      <PageLink
        href={page.older && auditHref({ ...filter, before: page.older })}
      >
        Older
        <ChevronRight aria-hidden strokeWidth={1.75} />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  return href ? (
    <ButtonLink href={href}>{children}</ButtonLink>
  ) : (
    <Button disabled>{children}</Button>
  );
}

function AuditSkeleton() {
  return (
    <div className="mt-8">
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
