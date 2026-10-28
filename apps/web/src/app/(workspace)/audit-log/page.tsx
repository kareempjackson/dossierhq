import {
  TOOL_NAMES,
  toolSchema,
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
import {
  getAuditCounts,
  getAuditPage,
  getClients,
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
            Every read Dossier made from your{' '}
            <Link href="/connections" className="underline underline-offset-2">
              connected tools
            </Link>
            , newest first. Reads are kept for 90 days.
          </p>
        </header>
        <Suspense fallback={<AuditSkeleton />}>
          <AuditLog searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

/** The audit log's URL for a filter and a page. */
function auditHref(query: { tool?: Tool; before?: string; after?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `/audit-log?${search}` : '/audit-log';
}

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

async function AuditLog({
  searchParams,
}: Pick<PageProps<'/audit-log'>, 'searchParams'>) {
  const query = await searchParams;
  const parsed = toolSchema.safeParse(query.tool);
  const tool: Tool | undefined = parsed.success ? parsed.data : undefined;
  const before = one(query.before);
  const after = one(query.after);
  const [page, counts, clients, workspace] = await Promise.all([
    getAuditPage({ tool, before, after }).catch(orNull),
    getAuditCounts().catch(orNull),
    getClients().catch(orEmpty),
    getWorkspace(),
  ]);
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const entries = page?.data ?? [];
  const tools = toolSchema.options;
  const countOf = (t: Tool) => counts?.find((c) => c.tool === t)?.count;

  return (
    <div className="mt-8">
      <SegmentedFilter
        label="Filter the audit log by tool"
        value={tool ?? 'all'}
        options={[
          {
            value: 'all',
            label: 'All',
            href: auditHref({}),
            count: counts?.reduce((sum, c) => sum + c.count, 0),
          },
          ...tools.map((t) => ({
            value: t,
            label: TOOL_NAMES[t],
            href: auditHref({ tool: t }),
            count: countOf(t),
          })),
        ]}
      />
      <div className="mt-3">
        {page === null ? (
          <ErrorState what="the audit log" />
        ) : entries.length === 0 ? (
          before ? (
            <EmptyState title="No older reads.">
              Reads are kept for 90 days.
            </EmptyState>
          ) : (
            <EmptyState title="No reads yet.">
              {tool
                ? `Dossier hasn’t read anything from ${TOOL_NAMES[tool]} yet.`
                : 'Reads appear here as soon as a tool is connected.'}
            </EmptyState>
          )
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
                        {formatDateTime(entry.at, workspace.timeZone)}
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
        {page && <Pager page={page} tool={tool} />}
      </div>
    </div>
  );
}

/** Newer and Older, with the end the reader is at shown but unavailable. */
function Pager({ page, tool }: { page: AuditPage; tool?: Tool }) {
  if (!page.newer && !page.older) return null;
  return (
    <nav
      aria-label="Audit log pages"
      className="mt-4 flex items-center justify-between gap-3"
    >
      <PageLink href={page.newer && auditHref({ tool, after: page.newer })}>
        <ChevronLeft aria-hidden strokeWidth={1.75} />
        Newer
      </PageLink>
      <PageLink href={page.older && auditHref({ tool, before: page.older })}>
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
