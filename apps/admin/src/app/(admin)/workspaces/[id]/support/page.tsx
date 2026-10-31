import { Suspense } from 'react';
import { StaffLogTable } from '@/components/log/staff-log-table';
import { OpenSupportView } from '@/components/support/open-support-view';
import { SupportViews } from '@/components/support/support-views';
import { EmptyState, ErrorState } from '@/components/ui/states';
import {
  WorkspaceSheet,
  WorkspaceSheetSkeleton,
  loadWorkspace,
} from '@/components/workspace/workspace-sheet';
import { getActivity, getWorkspaceSupportViews } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

export const metadata = { title: 'Support' };

export default function WorkspaceSupportPage({
  params,
}: PageProps<'/workspaces/[id]/support'>) {
  return (
    <Suspense fallback={<WorkspaceSheetSkeleton />}>
      <Support params={params} />
    </Suspense>
  );
}

async function Support({
  params,
}: Pick<PageProps<'/workspaces/[id]/support'>, 'params'>) {
  const detail = await loadWorkspace(params);
  const { workspace } = detail;
  const [views, log] = await Promise.all([
    getWorkspaceSupportViews(workspace.id).catch(orNull),
    getActivity({ workspaceId: workspace.id }).catch(orNull),
  ]);
  const now = new Date().toISOString();
  return (
    <WorkspaceSheet detail={detail} tab="support">
      <section aria-labelledby="view-heading">
        <h2 id="view-heading" className="text-section font-medium text-ink">
          See what they see
        </h2>
        <p className="mt-1 max-w-2xl text-meta text-text">
          Opens {workspace.name} in Dossier as its owner sees it, read-only:
          nothing can be changed, sent or synced from the view, and the owner’s
          own sessions, two-factor and notifications stay private.
          {workspace.suspension && ' Views still open while it’s suspended.'}
        </p>
        <div className="mt-4">
          <OpenSupportView
            workspaceId={workspace.id}
            workspaceName={workspace.name}
          />
        </div>
      </section>

      <section aria-labelledby="views-heading" className="mt-10">
        <h2 id="views-heading" className="text-section font-medium text-ink">
          Support views
        </h2>
        {views === null ? (
          <ErrorState what="support views" className="mt-3" />
        ) : views.length === 0 ? (
          <EmptyState title="Nobody has looked yet" className="mt-3" />
        ) : (
          <div className="mt-3">
            <SupportViews views={views} showWorkspace={false} now={now} />
          </div>
        )}
      </section>

      <section aria-labelledby="staff-log-heading" className="mt-10">
        <h2
          id="staff-log-heading"
          className="text-section font-medium text-ink"
        >
          What staff did here
        </h2>
        {log === null ? (
          <ErrorState what="the activity log" className="mt-3" />
        ) : log.data.length === 0 ? (
          <EmptyState title="Nothing yet" className="mt-3" />
        ) : (
          <div className="mt-3">
            <StaffLogTable entries={log.data} showWorkspace={false} />
          </div>
        )}
      </section>
    </WorkspaceSheet>
  );
}
