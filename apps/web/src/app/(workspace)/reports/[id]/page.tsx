import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import {
  ReportEditor,
  type NumberedSource,
  type ReportNav,
} from '@/components/report/report-editor';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/states';
import {
  getClient,
  getReport,
  getReviewQueue,
  getSources,
  getWeekNumber,
  getWorkspace,
} from '@/lib/data';
import { formatDateRange, formatTimestamp } from '@/lib/format';

export async function generateMetadata({ params }: PageProps<'/reports/[id]'>) {
  const report = await getReport((await params).id).catch(() => null);
  return { title: report?.title ?? 'Report' };
}

export default function ReportPage({ params }: PageProps<'/reports/[id]'>) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportScreen params={params} />
    </Suspense>
  );
}

async function ReportScreen({
  params,
}: Pick<PageProps<'/reports/[id]'>, 'params'>) {
  const report = await getReport((await params).id);
  if (!report) notFound();
  const [client, workspace, queue, week] = await Promise.all([
    getClient(report.clientId),
    getWorkspace(),
    getReviewQueue().catch(() => []),
    getWeekNumber(report.weekStart),
  ]);
  if (!client) notFound();

  // Number sources in the order the report first cites them.
  const order = [
    ...new Set(
      report.sections.flatMap((section) =>
        section.lines.flatMap((line) => line.sourceIds),
      ),
    ),
  ];
  const sources: NumberedSource[] = (await getSources(order)).map((source) => ({
    ...source,
    number: order.indexOf(source.id) + 1,
  }));

  // Drafts page through the queue group they belong to.
  let nav: ReportNav | null = null;
  if (report.status === 'draft') {
    const hasExceptions = report.exceptions.length > 0;
    const group = queue.filter(
      (item) => item.exceptions.length > 0 === hasExceptions,
    );
    const index = group.findIndex((item) => item.id === report.id);
    if (index >= 0) {
      nav = {
        position: index + 1,
        total: group.length,
        group: hasExceptions ? 'with exceptions' : 'clean',
        prevHref: index > 0 ? `/reports/${group[index - 1]!.id}` : null,
        nextHref:
          index < group.length - 1 ? `/reports/${group[index + 1]!.id}` : null,
      };
    }
  }

  const weekLabel = week ? `Week ${week}` : 'Weekly report';
  const meta = [
    weekLabel,
    formatDateRange(report.weekStart, report.weekEnd),
    `drafted ${formatTimestamp(report.generatedAt, workspace.timeZone)}`,
    `for ${client.primaryContact.name}`,
  ].join(' · ');

  return (
    <ReportEditor
      report={report}
      client={{ id: client.id, name: client.name }}
      weekLabel={weekLabel}
      meta={meta}
      sources={sources}
      nav={nav}
      approvedLabel={
        report.approvedAt
          ? `Approved ${formatTimestamp(report.approvedAt, workspace.timeZone)}`
          : null
      }
    />
  );
}

function ReportSkeleton() {
  return (
    <>
      <Sheet scroll="xl" className="min-w-0 flex-1 px-5 pt-6 sm:px-10">
        <Skeleton className="h-3 w-48" />
        <div className="mx-auto mt-10 max-w-180" aria-hidden>
          <Skeleton className="h-9 w-80 max-w-full" />
          <Skeleton className="mt-4 h-3 w-96 max-w-full" />
          <Skeleton className="mt-8 h-20 w-full rounded-tile" />
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="mt-8 grid gap-3 sm:grid-cols-[148px_1fr]">
              <Skeleton className="h-3 w-24" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        <span role="status" className="sr-only">
          Loading report
        </span>
      </Sheet>
      <Sheet scroll="xl" className="p-5 xl:w-90 xl:shrink-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-4/5" />
      </Sheet>
    </>
  );
}
