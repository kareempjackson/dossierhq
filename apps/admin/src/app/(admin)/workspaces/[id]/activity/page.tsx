import type { AuditEntry, AuditKind } from '@dossierhq/contracts';
import { Suspense } from 'react';
import { Pager } from '@/components/ui/pager';
import { SegmentedFilter } from '@/components/ui/segmented-filter';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import {
  WorkspaceSheet,
  WorkspaceSheetSkeleton,
  loadWorkspace,
} from '@/components/workspace/workspace-sheet';
import { getWorkspaceAudit } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { When } from '@/lib/format';

export const metadata = { title: 'Activity' };

const KINDS: { value: AuditKind | 'all'; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'sign-in', label: 'Sign-ins' },
  { value: 'change', label: 'Changes' },
  { value: 'read', label: 'Reads' },
];

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export default function WorkspaceActivityPage({
  params,
  searchParams,
}: PageProps<'/workspaces/[id]/activity'>) {
  return (
    <Suspense fallback={<WorkspaceSheetSkeleton />}>
      <Activity params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Activity({
  params,
  searchParams,
}: PageProps<'/workspaces/[id]/activity'>) {
  const detail = await loadWorkspace(params);
  const query = await searchParams;
  const raw = one(query.kind);
  const kind = KINDS.some((k) => k.value === raw && raw !== 'all')
    ? (raw as AuditKind)
    : undefined;
  const page = await getWorkspaceAudit(detail.workspace.id, {
    kind,
    before: one(query.before),
    after: one(query.after),
  }).catch(orNull);
  const base = `/workspaces/${detail.workspace.id}/activity`;
  const href = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ kind, ...extra })) {
      if (value) params.set(key, value);
    }
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  };

  return (
    <WorkspaceSheet detail={detail} tab="activity">
      <p className="max-w-2xl text-text">
        The workspace’s own audit log, as its owners see it. Times are UTC.
      </p>
      <SegmentedFilter
        label="Filter the audit log"
        className="mt-4"
        value={kind ?? 'all'}
        options={KINDS.map((k) => ({
          value: k.value,
          label: k.label,
          href:
            k.value === 'all'
              ? base
              : `${base}?${new URLSearchParams({ kind: k.value })}`,
        }))}
      />
      {!page ? (
        <ErrorState what="the audit log" className="mt-4" />
      ) : page.data.length === 0 ? (
        <EmptyState title="Nothing here yet" className="mt-4" />
      ) : (
        <>
          <AuditTable entries={page.data} />
          <Pager
            label="Audit log pages"
            newer={page.newer && href({ after: page.newer })}
            older={page.older && href({ before: page.older })}
          />
        </>
      )}
    </WorkspaceSheet>
  );
}

function AuditTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-card bg-sheet shadow-card">
      <table className="w-full min-w-180 text-left">
        <caption className="sr-only">
          The workspace’s audit log, newest first
        </caption>
        <thead className="text-meta text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Time
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Who
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              What
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Records
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-2.5 font-mono text-mono whitespace-nowrap text-muted">
                <When iso={entry.at} />
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-text">
                {entry.actor ? (
                  <span title={entry.actor.email}>{entry.actor.name}</span>
                ) : (
                  <span className="text-muted">Dossier</span>
                )}
                {entry.ip && (
                  <span className="block font-mono text-mono text-muted">
                    {entry.ip}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-text">
                {entry.what}
                {entry.outcome === 'failed' && (
                  <StatusDot
                    tone="failure"
                    label="Failed"
                    className="mt-1 text-meta-sm text-muted"
                  />
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-text tabular-nums">
                {entry.kind === 'read'
                  ? entry.recordCount.toLocaleString('en-GB')
                  : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
