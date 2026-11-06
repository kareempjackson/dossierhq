'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { TopBar } from '@/components/shell/top-bar';
import { FolderSheet, FolderTabs } from '@/components/ui/folder-tabs';
import type { ReportQuestion } from '@/lib/workspace';
import { DraftNowButton } from './draft-now-button';

export type Decision = 'approved' | 'skipped';
export type DraftSummary = { id: string; clientName: string; checks: number };

type ReportsState = {
  week: string | null;
  drafts: DraftSummary[];
  decisions: Record<string, Decision>;
  decide: (id: string, decision: Decision | null) => void;
  questions: ReportQuestion[];
  setQuestions: (questions: ReportQuestion[]) => void;
};

const Context = createContext<ReportsState | null>(null);

/** This week's review choices and the saved questions, shared by every Reports tab. */
export function useReports() {
  const context = useContext(Context);
  if (!context) throw new Error('useReports needs ReportsShell around it');
  return context;
}

/**
 * Reports' header, tabs and sheet. Choices made on one tab (approving a
 * report, adding a question) show on the others; they're kept in the browser
 * until the API is connected.
 */
export function ReportsShell({
  week,
  sends,
  drafts,
  approvedCount,
  initialQuestions,
  children,
}: {
  /** e.g. "Week of 26 Oct"; null before the first week of reports. */
  week: string | null;
  sends: string | null;
  drafts: DraftSummary[];
  approvedCount: number;
  initialQuestions: ReportQuestion[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [questions, setQuestions] = useState(initialQuestions);

  const decide = (id: string, decision: Decision | null) =>
    setDecisions((current) => {
      const next = { ...current };
      if (decision) next[id] = decision;
      else delete next[id];
      return next;
    });

  const toReview = drafts.filter((draft) => !decisions[draft.id]).length;
  const approved =
    approvedCount +
    Object.values(decisions).filter((d) => d === 'approved').length;
  const tab = pathname.startsWith('/reports/approved')
    ? 'approved'
    : pathname.startsWith('/reports/questions')
      ? 'questions'
      : pathname.startsWith('/reports/delivery')
        ? 'delivery'
        : 'review';
  const subtitle = {
    review: [week, `${toReview} to review`].filter(Boolean).join(' · '),
    approved: [week, `${approved} going out${sends ? ` ${sends}` : ''}`]
      .filter(Boolean)
      .join(' · '),
    questions: 'Questions every weekly report answers',
    delivery: 'How reports look, and when they go',
  }[tab];

  return (
    <Context.Provider
      value={{ week, drafts, decisions, decide, questions, setQuestions }}
    >
      <TopBar title="Reports" subtitle={subtitle} />
      <div className="mt-6 rounded-3xl bg-grey-2 p-2.5 sm:p-3">
        <FolderTabs
          label="Reports"
          tabs={[
            {
              href: '/reports',
              label: 'To review',
              count: toReview,
              current: tab === 'review',
            },
            {
              href: '/reports/approved',
              label: 'Approved',
              count: approved,
              current: tab === 'approved',
            },
            {
              href: '/reports/questions',
              label: 'Questions',
              count: questions.length,
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
    </Context.Provider>
  );
}
