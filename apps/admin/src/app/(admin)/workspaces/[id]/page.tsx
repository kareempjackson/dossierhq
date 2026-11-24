import {
  INTELLIGENCE_KIND_NAMES,
  TOOL_NAMES,
  type WorkspaceDetail,
} from '@dossierhq/contracts';
import { Suspense } from 'react';
import { ListCard } from '@/components/ui/list-card';
import { EmptyState } from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import {
  WorkspaceSheet,
  WorkspaceSheetSkeleton,
  loadWorkspace,
} from '@/components/workspace/workspace-sheet';
import { When, formatTimestamp } from '@/lib/format';

export const metadata = { title: 'Workspace' };

export default function WorkspacePage({
  params,
}: PageProps<'/workspaces/[id]'>) {
  return (
    <Suspense fallback={<WorkspaceSheetSkeleton />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({
  params,
}: Pick<PageProps<'/workspaces/[id]'>, 'params'>) {
  const detail = await loadWorkspace(params);
  const { workspace } = detail;
  return (
    <WorkspaceSheet detail={detail} tab="overview">
      {workspace.suspension && (
        <div className="mb-8 rounded-card bg-alert-soft px-5 py-4">
          <p className="font-medium text-ink">
            Suspended since {formatTimestamp(workspace.suspension.at)}
          </p>
          <p className="mt-1 text-meta text-text">
            “{workspace.suspension.reason}” Nobody can sign in, and nothing
            syncs, drafts or sends. Support views still open.
          </p>
        </div>
      )}
      <Figures detail={detail} />
      <section aria-labelledby="owner-heading" className="mt-10">
        <h2 id="owner-heading" className="text-section font-medium text-ink">
          Owner
        </h2>
        <p className="mt-2 text-text">
          {workspace.owner
            ? `${workspace.owner.name} · ${workspace.owner.email}`
            : 'Nobody is the owner. Every workspace should keep one.'}
        </p>
      </section>
      <section aria-labelledby="connections-heading" className="mt-10">
        <h2
          id="connections-heading"
          className="text-section font-medium text-ink"
        >
          Connections
        </h2>
        {detail.connectors.length === 0 ? (
          <EmptyState title="No tools connected" className="mt-3">
            They haven’t connected NinjaOne, Hudu, SharePoint or Fathom yet.
          </EmptyState>
        ) : (
          <ListCard className="mt-3">
            {detail.connectors.map((connector) => (
              <li key={connector.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-medium text-ink">
                    {TOOL_NAMES[connector.tool]}
                    {connector.account && (
                      <span className="font-normal text-muted">
                        {' '}
                        · {connector.account}
                      </span>
                    )}
                  </span>
                  <StatusDot
                    tone={
                      connector.status === 'failing' ? 'failure' : 'positive'
                    }
                    label={
                      connector.status === 'failing'
                        ? 'Failing'
                        : connector.status === 'syncing'
                          ? 'Syncing'
                          : 'Healthy'
                    }
                    className="text-meta"
                  />
                </div>
                <p className="text-meta text-muted">
                  Last good sync:{' '}
                  {connector.lastSyncAt ? (
                    <When iso={connector.lastSyncAt} />
                  ) : (
                    'never'
                  )}
                </p>
                {connector.failure && (
                  <p className="text-meta text-text">
                    {connector.failure.summary} Since{' '}
                    <When iso={connector.failure.since} />.
                  </p>
                )}
              </li>
            ))}
          </ListCard>
        )}
      </section>
      <AiUsage ai={detail.ai} />
    </WorkspaceSheet>
  );
}

const dollars = (value: number) => `$${value.toFixed(2)}`;

/** What the workspace's AI has run and cost, and what holds it back. */
function AiUsage({ ai }: { ai: WorkspaceDetail['ai'] }) {
  const total = ai.spend.reduce((sum, row) => sum + row.cost, 0);
  const runs = ai.spend.reduce((sum, row) => sum + row.runs, 0);
  return (
    <section aria-labelledby="ai-heading" className="mt-10">
      <h2 id="ai-heading" className="text-section font-medium text-ink">
        AI usage
      </h2>
      <p className="mt-2 text-text">
        {dollars(ai.spentToday)} of {dollars(ai.dailyBudget)} today on their own
        key · {ai.trialRuns.toLocaleString('en-GB')} trial{' '}
        {ai.trialRuns === 1 ? 'run' : 'runs'} on Dossier’s key
      </p>
      {ai.pausedUntil && (
        <p className="mt-1 text-meta text-alert">
          Background work is paused until <When iso={ai.pausedUntil} />
          {ai.pausedReason ? `: ${ai.pausedReason}` : '.'}
        </p>
      )}
      {ai.spend.length === 0 ? (
        <EmptyState title="Nothing has run" className="mt-3">
          No model runs in the last 30 days.
        </EmptyState>
      ) : (
        <ListCard className="mt-3">
          {ai.spend.map((row) => (
            <li
              key={row.kind}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <span className="font-medium text-ink">
                {INTELLIGENCE_KIND_NAMES[row.kind]}
              </span>
              <span className="text-meta text-muted tabular-nums">
                {row.runs.toLocaleString('en-GB')}{' '}
                {row.runs === 1 ? 'run' : 'runs'} · {dollars(row.cost)}
              </span>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium text-ink">Last 30 days</span>
            <span className="text-meta text-ink tabular-nums">
              {runs.toLocaleString('en-GB')} {runs === 1 ? 'run' : 'runs'} ·{' '}
              {dollars(total)}
            </span>
          </li>
        </ListCard>
      )}
    </section>
  );
}

function Figures({ detail }: { detail: WorkspaceDetail }) {
  const { workspace, reports } = detail;
  const figures = [
    { label: 'People', value: workspace.members },
    { label: 'Clients', value: workspace.clients },
    {
      label: 'Connections',
      value: workspace.connectors,
      note:
        workspace.failingConnectors > 0
          ? `${workspace.failingConnectors} failing`
          : undefined,
    },
    { label: 'Reports to review', value: reports.draft },
    { label: 'Approved, not sent', value: reports.approved },
    { label: 'Reports sent', value: reports.sent },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {figures.map((figure) => (
        <div
          key={figure.label}
          className="rounded-tile bg-surface-soft px-4 py-3"
        >
          <dt className="text-meta text-muted">{figure.label}</dt>
          <dd className="mt-1 text-section font-medium text-ink tabular-nums">
            {figure.value.toLocaleString('en-GB')}
            {figure.note && (
              <span className="ml-2 text-meta font-normal text-alert">
                {figure.note}
              </span>
            )}
          </dd>
        </div>
      ))}
      <div className="col-span-2 rounded-tile bg-surface-soft px-4 py-3 sm:col-span-3">
        <dt className="text-meta text-muted">Last active</dt>
        <dd className="mt-1 text-body text-ink">
          {workspace.lastActiveAt ? (
            <When iso={workspace.lastActiveAt} />
          ) : (
            'Nobody is signed in'
          )}
        </dd>
      </div>
    </dl>
  );
}
