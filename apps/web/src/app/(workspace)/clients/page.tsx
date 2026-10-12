import { isoWeek, type ClientListItem } from '@dossierhq/contracts';
import Link from 'next/link';
import { Suspense } from 'react';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { getClientList, getNow, getWorkspace } from '@/lib/data';
import {
  formatDate,
  formatDayMonth,
  formatDaysAgo,
  plural,
} from '@/lib/format';

export const metadata = { title: 'Clients' };

export default function ClientsPage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <h1 className="text-title-compact sm:text-title">Clients</h1>
        <Suspense fallback={<ClientsSkeleton />}>
          <ClientsTable />
        </Suspense>
      </div>
    </Sheet>
  );
}

function attentionOf({ attention }: ClientListItem): {
  tone: StatusTone;
  label: string;
} {
  if (attention.total === 0) return { tone: 'positive', label: 'All clear' };
  const detail =
    attention.critical > 0
      ? `${attention.critical} critical`
      : attention.high > 0
        ? `${attention.high} high`
        : null;
  return {
    tone:
      attention.critical > 0
        ? 'failure'
        : attention.high > 0
          ? 'strong'
          : 'neutral',
    label: detail ? `${attention.total} · ${detail}` : String(attention.total),
  };
}

async function ClientsTable() {
  const [items, now, workspace] = await Promise.all([
    getClientList().catch(() => null),
    getNow(),
    getWorkspace(),
  ]);
  const needing = items?.filter((item) => item.attention.total > 0).length ?? 0;

  if (items === null) {
    return <ErrorState what="your clients" className="mt-8" />;
  }

  return (
    <>
      <p className="mt-3 text-meta text-muted">
        {items.length === 0
          ? 'Clients appear once a tool is connected.'
          : `${plural(items.length, 'client')} · ${needing} need attention · most urgent first`}
      </p>
      {items.length === 0 ? (
        <EmptyState title="No clients yet." className="mt-8">
          Dossier finds your clients in NinjaOne and Hudu once they are
          connected.
        </EmptyState>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-card bg-sheet shadow-card">
          <table className="w-full min-w-170 text-left">
            <caption className="sr-only">
              Clients, most urgent first, with their last meeting and report
            </caption>
            <thead className="text-meta text-muted">
              <tr className="border-b border-hairline">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Client
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Needs attention
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Last meeting
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Last report
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {items.map((item) => {
                const attention = attentionOf(item);
                const report = item.latestReport;
                const week = report ? isoWeek(report.weekStart) : null;
                return (
                  <tr
                    key={item.client.id}
                    className="transition-colors hover:bg-surface-soft"
                  >
                    <th scope="row" className="px-4 py-3 font-normal">
                      <Link
                        href={`/clients/${item.client.id}`}
                        className="rounded-row font-medium text-ink underline-offset-2 hover:underline"
                      >
                        {item.client.name}
                      </Link>
                      <span className="block text-meta text-muted">
                        {item.client.industry} · {item.client.location}
                      </span>
                    </th>
                    <td className="px-4 py-3 whitespace-nowrap text-text">
                      <StatusDot
                        tone={attention.tone}
                        label={attention.label}
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.lastMeetingAt ? (
                        <>
                          <span className="block text-text">
                            {formatDate(item.lastMeetingAt, workspace.timeZone)}
                          </span>
                          <span className="block text-meta text-muted">
                            {formatDaysAgo(item.lastMeetingAt, now)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">None yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {report ? (
                        <Link
                          href={`/reports/${report.id}`}
                          className="group block rounded-row"
                        >
                          <span className="block text-text group-hover:underline">
                            Week {week}
                          </span>
                          <span className="block text-meta text-muted">
                            {report.status === 'approved' && report.approvedAt
                              ? `Approved ${formatDayMonth(report.approvedAt, workspace.timeZone)}`
                              : report.status === 'skipped'
                                ? 'Skipped'
                                : report.exceptions.length > 0
                                  ? `Draft, ${plural(report.exceptions.length, 'exception')}`
                                  : 'Draft, clean'}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted">None yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ClientsSkeleton() {
  return (
    <div>
      <LoadingLabel what="clients" />
      <Skeleton className="mt-4 h-3 w-64" />
      <div className="mt-8 flex flex-col gap-4 rounded-card bg-sheet p-4 shadow-card">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="grid grid-cols-4 gap-4">
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
