import { isoWeek } from '@dossierhq/contracts';
import { ChevronRight } from 'lucide-react';
import { Suspense } from 'react';
import {
  CleanReports,
  type CleanReportItem,
} from '@/components/report/clean-reports';
import { ListCard, ListCardRow } from '@/components/ui/list-card';
import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedFilter } from '@/components/ui/segmented-filter';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import {
  getClients,
  getReport,
  getReportSummaries,
  getReviewQueue,
  getWorkspace,
} from '@/lib/data';
import { formatDateRange, formatTimestamp, plural } from '@/lib/format';

export const metadata = { title: 'Reports' };

export default function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <h1 className="text-title-compact sm:text-title">Reports</h1>
        <Suspense fallback={<QueueSkeleton />}>
          <ReportsQueue searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function ReportsQueue({
  searchParams,
}: Pick<PageProps<'/reports'>, 'searchParams'>) {
  const view = (await searchParams).view === 'approved' ? 'approved' : 'week';
  const [queue, approved, clients, workspace] = await Promise.all([
    getReviewQueue().catch(() => null),
    getReportSummaries({ status: 'approved' }).catch(() => null),
    getClients().catch(() => []),
    getWorkspace(),
  ]);
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const first = queue?.[0];
  const week = first ? isoWeek(first.weekStart) : null;

  return (
    <>
      <p className="mt-3 text-meta text-muted">
        {first
          ? `Week ${week} · ${formatDateRange(first.weekStart, first.weekEnd)} · drafted ${formatTimestamp(first.generatedAt, workspace.timeZone)}`
          : 'Weekly reports for every client, drafted each Friday.'}
      </p>
      <SegmentedFilter
        label="Show reports"
        className="mt-6"
        value={view}
        options={[
          {
            value: 'week',
            label: 'To review',
            href: '/reports',
            count: queue?.length,
          },
          {
            value: 'approved',
            label: 'Approved',
            href: '/reports?view=approved',
            count: approved?.length,
          },
        ]}
      />
      <div className="mt-8 flex flex-col gap-10">
        {view === 'week' ? (
          <ToReview queue={queue} clientName={clientName} />
        ) : (
          <Approved
            approved={approved}
            clientName={clientName}
            timeZone={workspace.timeZone}
          />
        )}
      </div>
    </>
  );
}

async function ToReview({
  queue,
  clientName,
}: {
  queue: Awaited<ReturnType<typeof getReviewQueue>> | null;
  clientName: Map<string, string>;
}) {
  if (queue === null) return <ErrorState what="this week’s reports" />;
  if (queue.length === 0) {
    return (
      <EmptyState title="No reports waiting.">
        Everything this week is approved or skipped. Dossier drafts the next set
        on Friday morning.
      </EmptyState>
    );
  }

  const exceptions = queue.filter((report) => report.exceptions.length > 0);
  const clean = queue.filter((report) => report.exceptions.length === 0);
  const cleanReports = await Promise.all(
    clean.map((report) => getReport(report.id).catch(() => null)),
  );
  const cleanItems: CleanReportItem[] = clean.map((report, index) => {
    const glance = cleanReports[index]?.glance ?? [];
    const value = (label: string) =>
      glance.find((item) => item.label === label)?.value;
    return {
      id: report.id,
      clientName: clientName.get(report.clientId) ?? report.clientId,
      href: `/reports/${report.id}`,
      summary: [
        value('Devices') && `${value('Devices')} devices`,
        value('Patched') && `${value('Patched')} patched`,
        value('Alerts') && `${value('Alerts')} alerts`,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  });

  return (
    <>
      {exceptions.length > 0 && (
        <section aria-labelledby="exceptions-heading">
          <SectionHeader
            id="exceptions-heading"
            title="Exceptions"
            count={exceptions.length}
            note="Read these before they go out"
          />
          <ListCard elevation="float" className="mt-3">
            {exceptions.map((report) => (
              <ListCardRow
                key={report.id}
                href={`/reports/${report.id}`}
                className="items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {clientName.get(report.clientId) ?? report.clientId}
                  </p>
                  <ul className="mt-0.5 text-meta text-muted">
                    {report.exceptions.map((exception) => (
                      <li key={exception}>{exception}</li>
                    ))}
                  </ul>
                </div>
                <span className="flex shrink-0 items-center gap-0.5 text-meta text-text">
                  Review
                  <ChevronRight aria-hidden className="size-4" />
                </span>
              </ListCardRow>
            ))}
          </ListCard>
        </section>
      )}
      {/* Always rendered, so its Undo banner survives approving every clean report. */}
      <section aria-labelledby="clean-heading">
        <SectionHeader
          id="clean-heading"
          title="Clean"
          count={clean.length || undefined}
          note="Every line has a source and nothing needs a decision"
        />
        <div className="mt-3">
          <CleanReports items={cleanItems} />
        </div>
      </section>
    </>
  );
}

async function Approved({
  approved,
  clientName,
  timeZone,
}: {
  approved: Awaited<ReturnType<typeof getReportSummaries>> | null;
  clientName: Map<string, string>;
  timeZone: string;
}) {
  if (approved === null) return <ErrorState what="approved reports" />;
  if (approved.length === 0) {
    return (
      <EmptyState title="Nothing approved yet.">
        Reports you approve are kept here, week by week.
      </EmptyState>
    );
  }

  const byWeek = new Map<string, typeof approved>();
  for (const report of approved) {
    byWeek.set(report.weekStart, [
      ...(byWeek.get(report.weekStart) ?? []),
      report,
    ]);
  }
  const weeks = [...byWeek.keys()].map(
    (start) => [start, isoWeek(start)] as const,
  );

  return (
    <>
      {weeks.map(([start, number]) => {
        const reports = byWeek.get(start) ?? [];
        const headingId = `week-${start}-heading`;
        return (
          <section key={start} aria-labelledby={headingId}>
            <SectionHeader
              id={headingId}
              title={`Week ${number}`}
              count={reports.length}
              note={formatDateRange(start, reports[0]?.weekEnd ?? start)}
            />
            <ListCard className="mt-3">
              {reports.map((report) => (
                <ListCardRow
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="flex-wrap items-center justify-between"
                >
                  <p className="font-medium text-ink">
                    {clientName.get(report.clientId) ?? report.clientId}
                  </p>
                  <p className="text-meta text-muted">
                    {report.approvedAt
                      ? `Approved ${formatTimestamp(report.approvedAt, timeZone)}`
                      : 'Approved'}
                    {report.exceptions.length > 0 &&
                      ` · ${plural(report.exceptions.length, 'exception')}`}
                  </p>
                </ListCardRow>
              ))}
            </ListCard>
          </section>
        );
      })}
    </>
  );
}

function QueueSkeleton() {
  return (
    <div>
      <LoadingLabel what="reports" />
      <Skeleton className="mt-4 h-3 w-80 max-w-full" />
      <Skeleton className="mt-6 h-9 w-56 rounded-full" />
      <div className="mt-8 flex flex-col gap-3 rounded-card bg-sheet p-4 shadow-float">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex flex-col gap-2 py-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
