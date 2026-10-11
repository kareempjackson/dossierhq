import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { ListCard, ListCardRow } from '@/components/ui/list-card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import { getClient, getReportSummaries, getWorkspace } from '@/lib/data';
import { formatDate, formatDateRange, plural } from '@/lib/format';

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/reports'>) {
  const client = await getClient((await params).id).catch(() => null);
  return { title: client ? `${client.name} reports` : 'Reports' };
}

export default function ClientReportsPage({
  params,
}: PageProps<'/clients/[id]/reports'>) {
  return (
    <Suspense fallback={<ClientSheetSkeleton />}>
      <ClientReports params={params} />
    </Suspense>
  );
}

async function ClientReports({
  params,
}: Pick<PageProps<'/clients/[id]/reports'>, 'params'>) {
  const client = await loadClient(params);
  const [reports, workspace] = await Promise.all([
    getReportSummaries({ clientId: client.id }).catch(() => null),
    getWorkspace(),
  ]);

  return (
    <ClientSheet client={client} tab="reports">
      {reports === null ? (
        <ErrorState what="reports" />
      ) : reports.length === 0 ? (
        <EmptyState title="No reports yet.">
          Dossier drafts a weekly report for {client.name} every Friday.
        </EmptyState>
      ) : (
        <ListCard>
          {reports.map((report) => (
            <ListCardRow
              key={report.id}
              href={`/reports/${report.id}`}
              className="flex-wrap items-center justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  Week of {formatDateRange(report.weekStart, report.weekEnd)}
                </p>
                <p className="text-meta text-muted">
                  {report.exceptions.length > 0
                    ? report.exceptions.join(' · ')
                    : 'No exceptions'}
                </p>
              </div>
              <span className="text-meta text-text">
                {report.status === 'approved' && report.approvedAt ? (
                  <StatusDot
                    tone="positive"
                    label={`Approved ${formatDate(report.approvedAt, workspace.timeZone)}`}
                  />
                ) : report.status === 'skipped' ? (
                  <StatusDot tone="neutral" label="Skipped" />
                ) : (
                  <StatusDot
                    tone={report.exceptions.length > 0 ? 'strong' : 'neutral'}
                    label={
                      report.exceptions.length > 0
                        ? `Draft, ${plural(report.exceptions.length, 'exception')}`
                        : 'Draft, clean'
                    }
                  />
                )}
              </span>
            </ListCardRow>
          ))}
        </ListCard>
      )}
    </ClientSheet>
  );
}
