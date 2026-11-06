'use client';

import Link from 'next/link';
import type { ApprovedReport } from '@/lib/workspace';
import { useReports } from './reports-shell';

/** Approved this week and waiting for Monday, newest first. */
export function ApprovedView({
  approved,
  clientNames,
  sends,
}: {
  approved: ApprovedReport[];
  clientNames: Record<string, string>;
  /** When approved reports go out next; null until there's a schedule. */
  sends: string | null;
}) {
  const { drafts, decisions } = useReports();
  // Approved here, in this visit, go first.
  const justNow = drafts
    .filter((draft) => decisions[draft.id] === 'approved')
    .map((draft) => ({
      id: draft.id,
      clientId: draft.id.replace(/-\d{4}-\d{2}-\d{2}$/, ''),
      approvedBy: 'You',
      approvedAt: 'Just now',
    }));
  const rows = [
    ...justNow,
    ...approved.map((report) => ({ id: report.clientId, ...report })),
  ];

  if (rows.length === 0) {
    return (
      <div className="grid flex-1 place-items-center rounded-2xl bg-grey-1 p-10 text-center">
        <div>
          <p className="font-display text-h2">Nothing approved yet.</p>
          <p className="mt-2 text-small text-muted">
            Reports you approve wait here until they’re sent. Nothing goes out
            until someone approves it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-h3">Approved</h2>
        <p className="text-[0.75rem] text-muted">
          {sends
            ? `Each goes out ${sends}.`
            : 'Each goes out on the next send.'}{' '}
          Nothing else goes out until someone approves it.
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-separate border-spacing-y-1 text-left text-small">
          <thead>
            <tr className="text-[0.6875rem] text-muted">
              {['Client', 'Approved by', 'Approved', 'Goes out'].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-4 pb-2 font-normal"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="relative odd:[&>td]:bg-grey-1 [&>td]:transition-colors hover:[&>td]:bg-grey-2"
              >
                <td className="rounded-l-xl px-4 py-3.5">
                  <Link
                    href={`/clients/${row.clientId}/reports`}
                    className="rounded-sm font-semibold after:absolute after:inset-0"
                  >
                    {clientNames[row.clientId] ?? row.clientId}
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-muted">{row.approvedBy}</td>
                <td className="px-4 py-3.5 text-muted">{row.approvedAt}</td>
                <td className="rounded-r-xl px-4 py-3.5 text-muted">
                  {sends ?? 'Next send'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
