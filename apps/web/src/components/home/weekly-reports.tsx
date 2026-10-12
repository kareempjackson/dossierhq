import { ButtonLink } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { getClients, getReportSummaries, getWorkspace } from '@/lib/data';
import { formatCalendarDate, formatDateTime, formatList } from '@/lib/format';
import { ApproveCleanButton } from './approve-clean-button';

const headingId = 'weekly-reports-heading';

/** This week's drafts in one row: approve the clean ones, review the rest. */
export async function WeeklyReports() {
  const [reports, clients, workspace] = await Promise.all([
    getReportSummaries().catch(() => null),
    getClients().catch(() => []),
    getWorkspace(),
  ]);
  const drafts = reports?.filter((report) => report.status === 'draft') ?? [];
  const clean = drafts.filter((report) => report.exceptions.length === 0);
  const exceptions = drafts.filter((report) => report.exceptions.length > 0);
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const first = drafts[0];

  const headline =
    exceptions.length === 0
      ? `All ${drafts.length} are clean`
      : clean.length === 0
        ? `All ${drafts.length} have exceptions`
        : `${clean.length} ${clean.length === 1 ? 'is' : 'are'} clean, ${exceptions.length} ${exceptions.length === 1 ? 'has' : 'have'} exceptions`;

  return (
    <section aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="This week’s reports" />
      <div className="mt-3">
        {reports === null ? (
          <ErrorState what="this week’s reports" />
        ) : !first ? (
          <EmptyState title="No reports waiting.">
            Dossier drafts each client’s weekly report on Friday morning.
          </EmptyState>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-card bg-sheet px-4 py-4 shadow-card">
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-medium text-ink">{headline}</p>
              <p className="mt-0.5 text-meta text-muted">
                Week of {formatCalendarDate(first.weekStart)} · drafted{' '}
                {formatDateTime(first.generatedAt, workspace.timeZone)}
              </p>
              {exceptions.length > 0 && (
                <p className="mt-0.5 text-meta text-muted">
                  Exceptions at{' '}
                  {formatList(
                    exceptions.map(
                      (report) => clientName.get(report.clientId) ?? 'a client',
                    ),
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {exceptions.length > 0 && (
                <ButtonLink href="/reports">
                  Review {exceptions.length}
                </ButtonLink>
              )}
              <ApproveCleanButton ids={clean.map((report) => report.id)} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function WeeklyReportsSkeleton() {
  return (
    <section aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="This week’s reports" />
      <LoadingLabel what="this week’s reports" />
      <div className="mt-3 flex items-center gap-6 rounded-card bg-sheet px-4 py-4 shadow-card">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
    </section>
  );
}
