import type { WorkspaceSummary } from '@dossierhq/contracts';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/pager';
import { Pill } from '@/components/ui/pill';
import { SegmentedFilter } from '@/components/ui/segmented-filter';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import { getWorkspaces } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { When } from '@/lib/format';

export const metadata = { title: 'Workspaces' };

type Status = 'active' | 'suspended';
type Filter = { q?: string; status?: Status; page?: number };

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

function href({ q, status, page }: Filter) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (page && page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export default function WorkspacesPage({ searchParams }: PageProps<'/'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-280">
        <header>
          <h1 className="text-title-compact sm:text-title">Workspaces</h1>
          <p className="mt-3 max-w-2xl text-text">
            Every MSP on Dossier, newest first. Search by name, workspace ID, or
            anyone’s email.
          </p>
        </header>
        <Suspense fallback={<ListSkeleton />}>
          <Workspaces searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function Workspaces({
  searchParams,
}: Pick<PageProps<'/'>, 'searchParams'>) {
  const params = await searchParams;
  const q = one(params.q)?.trim() || undefined;
  const raw = one(params.status);
  const status: Status | undefined =
    raw === 'active' || raw === 'suspended' ? raw : undefined;
  const page = Math.max(1, Number(one(params.page)) || 1);
  const result = await getWorkspaces({ q, status, page }).catch(orNull);
  const pages = result ? Math.ceil(result.total / result.pageSize) : 0;

  return (
    <div className="mt-8">
      {one(params.deleted) === '1' && (
        <p
          role="status"
          className="mb-4 rounded-tile bg-surface px-4 py-3 text-meta text-ink"
        >
          The workspace was deleted, with everything in it.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action="/" className="flex min-w-72 flex-1 items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="workspace-search" className="sr-only">
            Search workspaces
          </label>
          <span className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              strokeWidth={1.75}
            />
            <input
              id="workspace-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Name, ID or email"
              className="h-9 w-full rounded-full bg-surface pr-3 pl-9 text-body text-ink"
            />
          </span>
          <Button type="submit">Search</Button>
        </form>
        <SegmentedFilter
          label="Filter workspaces"
          value={status ?? 'all'}
          options={[
            { value: 'all', label: 'All', href: href({ q }) },
            {
              value: 'active',
              label: 'Active',
              href: href({ q, status: 'active' }),
            },
            {
              value: 'suspended',
              label: 'Suspended',
              href: href({ q, status: 'suspended' }),
            },
          ]}
        />
      </div>

      {!result ? (
        <ErrorState what="workspaces" className="mt-4" />
      ) : result.data.length === 0 ? (
        <EmptyState
          title={q ? `No workspaces match “${q}”` : 'No workspaces here'}
          className="mt-4"
        >
          {q ? 'Try part of the name, or someone’s email.' : null}
        </EmptyState>
      ) : (
        <>
          <p className="mt-4 text-meta text-muted">
            {result.total.toLocaleString('en-GB')}{' '}
            {result.total === 1 ? 'workspace' : 'workspaces'}
            {pages > 1 && ` · page ${result.page} of ${pages}`}
          </p>
          <WorkspaceTable workspaces={result.data} />
          <Pager
            label="Workspace pages"
            newer={page > 1 ? href({ q, status, page: page - 1 }) : null}
            older={page < pages ? href({ q, status, page: page + 1 }) : null}
          />
        </>
      )}
    </div>
  );
}

function WorkspaceTable({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-card bg-sheet shadow-card">
      <table className="w-full min-w-220 text-left">
        <caption className="sr-only">Workspaces, newest first</caption>
        <thead className="text-meta text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Workspace
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Owner
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              People
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Clients
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Connections
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Last active
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Started
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {workspaces.map((w) => (
            <tr key={w.id} className="hover:bg-surface-soft">
              <td className="px-4 py-2.5">
                <Link
                  href={`/workspaces/${w.id}`}
                  className="font-medium text-ink underline-offset-2 hover:underline"
                >
                  {w.name}
                </Link>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-mono text-muted">{w.id}</span>
                  {w.suspension && <Pill tone="quiet">Suspended</Pill>}
                </span>
              </td>
              <td className="px-4 py-2.5 text-text">
                {w.owner ? (
                  <>
                    <span className="block">{w.owner.name}</span>
                    <span className="block text-meta text-muted">
                      {w.owner.email}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">No owner</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-text tabular-nums">
                {w.members}
              </td>
              <td className="px-4 py-2.5 text-right text-text tabular-nums">
                {w.clients}
              </td>
              <td className="px-4 py-2.5 text-text">
                {w.connectors === 0 ? (
                  <span className="text-muted">None</span>
                ) : w.failingConnectors > 0 ? (
                  <StatusDot
                    tone="failure"
                    label={`${w.failingConnectors} of ${w.connectors} failing`}
                    className="text-meta"
                  />
                ) : (
                  <StatusDot
                    tone="positive"
                    label={`${w.connectors} healthy`}
                    className="text-meta"
                  />
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-mono whitespace-nowrap text-muted">
                {w.lastActiveAt ? <When iso={w.lastActiveAt} /> : '–'}
              </td>
              <td className="px-4 py-2.5 font-mono text-mono whitespace-nowrap text-muted">
                <When iso={w.createdAt} date />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-8">
      <LoadingLabel what="workspaces" />
      <Skeleton className="h-9 w-full rounded-full" />
      <div className="mt-4 flex flex-col gap-3 rounded-card bg-sheet p-4 shadow-card">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}
