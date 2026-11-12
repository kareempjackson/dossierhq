'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { TopBar } from '@/components/shell/top-bar';
import { FolderSheet, FolderTabs } from '@/components/ui/folder-tabs';
import { useAppSelector } from '@/lib/store/hooks';
import { selectReports } from '@/lib/store/reports-slice';
import { DraftNowButton } from './draft-now-button';

/**
 * Reports' header, tabs and sheet. The week and the counts come from the
 * store, which the layout fills from the API; until then they don't show.
 */
export function ReportsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reports = useAppSelector(selectReports);
  const ready = reports.status === 'ready' ? reports : null;

  const tab = pathname.startsWith('/reports/approved')
    ? 'approved'
    : pathname.startsWith('/reports/questions')
      ? 'questions'
      : pathname.startsWith('/reports/delivery')
        ? 'delivery'
        : 'review';
  const subtitle = {
    review: ready
      ? [ready.week, `${ready.queue.length} to review`]
          .filter(Boolean)
          .join(' · ')
      : 'Each client’s weekly report, to read before it goes',
    approved: ready
      ? `${ready.approvedCount} going out${ready.sends ? ` ${ready.sends}` : ' when someone sends them'}`
      : 'Approved, and waiting to go',
    questions: 'Questions every weekly report answers',
    delivery: 'How reports look, and when they go',
  }[tab];

  return (
    <>
      <TopBar title="Reports" subtitle={subtitle} />
      <div className="mt-6 rounded-3xl bg-grey-2 p-2.5 sm:p-3">
        <FolderTabs
          label="Reports"
          tabs={[
            {
              href: '/reports',
              label: 'To review',
              count: ready?.queue.length,
              current: tab === 'review',
            },
            {
              href: '/reports/approved',
              label: 'Approved',
              count: ready?.approvedCount,
              current: tab === 'approved',
            },
            {
              href: '/reports/questions',
              label: 'Questions',
              count: ready?.questionCount,
              current: tab === 'questions',
            },
            {
              href: '/reports/delivery',
              label: 'Delivery',
              current: tab === 'delivery',
            },
          ]}
          actions={tab === 'review' ? <DraftNowButton /> : undefined}
        />
        <FolderSheet
          joinsFirstTab={tab === 'review'}
          className="flex flex-col p-4 sm:p-6 lg:min-h-[calc(100dvh-12rem)]"
        >
          {children}
        </FolderSheet>
      </div>
    </>
  );
}
