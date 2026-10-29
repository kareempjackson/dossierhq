import { hasRole, type ReportStatus } from '@dossierhq/contracts';
import { Suspense } from 'react';
import {
  ClientSheet,
  ClientSheetSkeleton,
  loadClient,
} from '@/components/client/client-sheet';
import { RecipientsEditor } from '@/components/report/recipients-editor';
import { DataList } from '@/components/ui/data-list';
import { ListCardRow } from '@/components/ui/list-card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import {
  getClient,
  getMe,
  getRecipients,
  getReportSummaries,
  getWorkspace,
} from '@/lib/data';
import { formatDate, formatDateRange, plural } from '@/lib/format';
import { orNull } from '@/lib/data/safe';
import { presentOptions } from '@/lib/list-options';

const STATUSES: Record<ReportStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  skipped: 'Skipped',
};

export async function generateMetadata({
  params,
}: PageProps<'/clients/[id]/reports'>) {
  const client = await getClient((await params).id).catch(orNull);
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
  const [reports, workspace, recipients, me] = await Promise.all([
    getReportSummaries({ clientId: client.id }).catch(orNull),
    getWorkspace(),
    getRecipients(client.id).catch(orNull),
    getMe().catch(orNull),
  ]);

  return (
    <ClientSheet client={client} tab="reports">
      {recipients !== null && (
        <div className="mb-6">
          <RecipientsEditor
            // Saved changes come back tidied, so start again from them.
            key={recipients.map((r) => `${r.email}:${r.copy}`).join()}
            clientId={client.id}
            clientName={client.name}
            recipients={recipients}
            canManage={hasRole(me?.role, 'admin')}
            suggestion={client.primaryContact?.name}
          />
        </div>
      )}
      {reports === null ? (
        <ErrorState what="reports" />
      ) : reports.length === 0 ? (
        <EmptyState title="No reports yet.">
          Draft {client.name}’s first weekly report from the Reports page, or
          have Dossier draft them each week from Report delivery.
        </EmptyState>
      ) : (
        <DataList
          rows={reports.map((report) => {
            const week = `Week of ${formatDateRange(report.weekStart, report.weekEnd)}`;
            const status =
              report.status === 'approved'
                ? report.sentAt
                  ? `Sent ${formatDate(report.sentAt, workspace.timeZone)}`
                  : report.approvedAt
                    ? `Approved ${formatDate(report.approvedAt, workspace.timeZone)}`
                    : 'Approved'
                : report.status === 'skipped'
                  ? 'Skipped'
                  : report.exceptions.length > 0
                    ? `Draft, ${plural(report.exceptions.length, 'exception')}`
                    : 'Draft, clean';
            return {
              id: report.id,
              text: [week, status, ...report.exceptions].join(' '),
              values: { status: report.status },
              node: (
                <ListCardRow
                  href={`/reports/${report.id}`}
                  className="flex-wrap items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{week}</p>
                    <p className="text-meta text-muted">
                      {report.exceptions.length > 0
                        ? report.exceptions.join(' · ')
                        : 'No exceptions'}
                    </p>
                  </div>
                  <span className="text-meta text-text">
                    <StatusDot
                      tone={
                        report.status === 'approved'
                          ? 'positive'
                          : report.status === 'draft' &&
                              report.exceptions.length > 0
                            ? 'strong'
                            : 'neutral'
                      }
                      label={status}
                    />
                  </span>
                </ListCardRow>
              ),
            };
          })}
          noun={['report', 'reports']}
          placeholder="Search weeks and exceptions"
          pageSize={20}
          filters={[
            {
              name: 'status',
              label: 'Status',
              options: presentOptions(
                reports.map((r) => r.status),
                STATUSES,
              ),
            },
          ]}
          layout={{ kind: 'list' }}
        />
      )}
    </ClientSheet>
  );
}
