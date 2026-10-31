import { hasStaffRole, type WorkspaceDetail } from '@dossierhq/contracts';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/states';
import { Tabs } from '@/components/ui/tabs';
import { getMe, getWorkspace } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { formatDate } from '@/lib/format';
import { WorkspaceActions } from './workspace-actions';

export type WorkspaceTab = 'overview' | 'people' | 'activity' | 'support';

/** Reads the workspace for a /workspaces/[id] page, or shows not-found. */
export async function loadWorkspace(params: Promise<{ id: string }>) {
  const detail = await getWorkspace((await params).id);
  if (!detail) notFound();
  return detail;
}

/** Whether the signed-in member of staff may change things. */
export async function canManage(): Promise<boolean> {
  const me = await getMe().catch(orNull);
  return me ? hasStaffRole(me.staff.role, 'admin') : false;
}

/** A workspace's page: breadcrumb, name, actions and tabs above each tab. */
export async function WorkspaceSheet({
  detail,
  tab,
  children,
}: {
  detail: WorkspaceDetail;
  tab: WorkspaceTab;
  children: ReactNode;
}) {
  const { workspace } = detail;
  const base = `/workspaces/${workspace.id}`;
  const manage = await canManage();
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-280">
        <Breadcrumb
          items={[
            { label: 'Workspaces', href: '/' },
            { label: workspace.name },
          ]}
        />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 text-title-compact sm:text-title">
              {workspace.name}
              {workspace.suspension ? (
                <Pill tone="quiet" dot>
                  Suspended
                </Pill>
              ) : (
                <Pill tone="positive" dot>
                  Active
                </Pill>
              )}
            </h1>
            <p className="mt-3 text-meta text-muted">
              <span className="font-mono">{workspace.id}</span> · started{' '}
              {formatDate(workspace.createdAt)} · {workspace.timeZone}
            </p>
          </div>
          {manage && (
            <WorkspaceActions
              id={workspace.id}
              name={workspace.name}
              suspended={workspace.suspension !== null}
            />
          )}
        </div>
        <Tabs
          label="Workspace sections"
          current={tab === 'overview' ? base : `${base}/${tab}`}
          className="mt-8"
          tabs={[
            { href: base, label: 'Overview' },
            {
              href: `${base}/people`,
              label: 'People',
              count: workspace.members,
            },
            { href: `${base}/activity`, label: 'Activity' },
            { href: `${base}/support`, label: 'Support' },
          ]}
        />
        <div className="mt-8">{children}</div>
      </div>
    </Sheet>
  );
}

export function WorkspaceSheetSkeleton() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-10">
      <div aria-hidden className="mx-auto max-w-280">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-6 h-10 w-80 max-w-full" />
        <Skeleton className="mt-10 h-10 w-full" />
        <Skeleton className="mt-8 h-48 w-full rounded-card" />
      </div>
    </Sheet>
  );
}
