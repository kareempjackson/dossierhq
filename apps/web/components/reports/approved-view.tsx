'use client';

import { Send } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { sendReport } from '@/app/(workspace)/reports/actions';
import { Button } from '@/components/ui/button';
import { BusyIcon } from '@/components/ui/spinner';
import type { OutboxRow } from '@/lib/report-views';

/** Approved and waiting to go; each can be sent now instead of waiting. */
export function ApprovedView({
  rows,
  sends,
}: {
  rows: OutboxRow[];
  /** "on Mondays at 09:00"; null when approved reports go by hand. */
  sends: string | null;
}) {
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    id: string;
    error?: string;
    sent?: string;
  } | null>(null);
  const [, startSending] = useTransition();

  const send = (row: OutboxRow) =>
    startSending(async () => {
      setSending(row.id);
      setMessage(null);
      const result = await sendReport(row.id);
      setSending(null);
      setMessage(
        result.ok
          ? { id: row.id, sent: `Sent ${row.clientName}’s report.` }
          : { id: row.id, error: result.error },
      );
    });

  const sentNote = message?.sent && (
    <p role="status" className="text-small text-healthy">
      {message.sent}
    </p>
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        {sentNote}
        <div className="grid flex-1 place-items-center rounded-2xl bg-grey-1 p-10 text-center">
          <div>
            <p className="font-display text-h2">Nothing waiting to go.</p>
            <p className="mt-2 text-small text-muted">
              Reports you approve wait here until they’re sent. Nothing goes out
              until someone approves it.
            </p>
          </div>
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
            ? `Each goes out ${sends}, or now if you send it.`
            : 'Each goes when someone sends it.'}{' '}
          Nothing else goes out until someone approves it.
        </p>
      </div>
      {sentNote && <div className="mt-3">{sentNote}</div>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-y-1 text-left text-small">
          <thead>
            <tr className="text-[0.6875rem] text-muted">
              {['Client', 'Week', 'Approved', 'Goes out', ''].map(
                (heading, index) => (
                  <th key={index} scope="col" className="px-4 pb-2 font-normal">
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
                className="odd:[&>td]:bg-grey-1 [&>td]:align-top [&>td]:transition-colors hover:[&>td]:bg-grey-2"
              >
                <td className="rounded-l-xl px-4 py-3.5">
                  <Link
                    href={`/reports/${encodeURIComponent(row.id)}`}
                    className="rounded-sm font-semibold underline decoration-ink/0 underline-offset-[3px] hover:decoration-ink/40"
                  >
                    {row.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3.5 text-muted">{row.week}</td>
                <td className="px-4 py-3.5 text-muted">{row.approved}</td>
                <td className="px-4 py-3.5 text-muted">
                  {row.goes}
                  {row.failed && (
                    <span className="mt-0.5 block text-[0.75rem] text-attention">
                      Last try didn’t go: {row.failed}
                    </span>
                  )}
                  {message?.id === row.id && message.error && (
                    <span
                      role="alert"
                      className="mt-0.5 block text-[0.75rem] text-attention"
                    >
                      {message.error}
                    </span>
                  )}
                </td>
                <td className="rounded-r-xl px-4 py-2.5 text-right">
                  {row.canSend ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sending !== null}
                      onClick={() => send(row)}
                    >
                      <BusyIcon icon={Send} busy={sending === row.id} />
                      Send now
                    </Button>
                  ) : (
                    <Link
                      href={`/clients/${encodeURIComponent(row.clientId)}/reports`}
                      className="text-[0.75rem] underline underline-offset-[3px]"
                    >
                      Add who it goes to
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
