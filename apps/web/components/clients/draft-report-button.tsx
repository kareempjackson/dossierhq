'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { draftClientReport } from '@/app/(workspace)/reports/actions';
import { Button } from '@/components/ui/button';
import { ConfirmPanel, useConfirm } from '@/components/ui/inline-confirm';
import { BusyIcon } from '@/components/ui/spinner';
import type { DraftChoice } from '@/lib/client-views';

/**
 * This week's report for one client, and drafting it now instead of
 * waiting for the schedule. Drafting again replaces the draft, so over
 * someone's edits, or a skipped report, it asks first. An approved report
 * stays as it is.
 */
export function DraftReport({
  clientId,
  choice,
  readOnly,
}: {
  clientId: string;
  choice: DraftChoice;
  readOnly: boolean;
}) {
  const confirm = useConfirm();
  const [busy, startDrafting] = useTransition();
  const [result, setResult] = useState<{ id?: string; error?: string }>({});

  const draft = () =>
    startDrafting(async () => {
      setResult({});
      const drafted = await draftClientReport(clientId);
      confirm.cancel();
      setResult(drafted.ok ? { id: drafted.id } : { error: drafted.error });
    });

  const status =
    choice.kind === 'new'
      ? 'Not drafted yet. Dossier drafts it on schedule, or you can now.'
      : choice.kind === 'approved'
        ? choice.sent
          ? 'Approved and sent.'
          : 'Approved, and waiting to go.'
        : choice.skipped
          ? 'Skipped this week.'
          : choice.edited
            ? 'A draft to review, with your edits.'
            : 'A draft to review.';
  const asks = choice.kind === 'again' && (choice.edited || choice.skipped);

  return (
    <section
      aria-labelledby="this-week"
      className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl bg-grey-1 px-4 py-3"
    >
      <div className="min-w-0">
        <h2 id="this-week" className="text-small font-medium">
          This week’s report
        </h2>
        <p className="text-small text-muted">{status}</p>
        {result.id && (
          <p role="status" className="mt-1 text-small text-healthy">
            Drafted.{' '}
            <Link
              href={`/reports/${encodeURIComponent(result.id)}`}
              className="rounded-sm font-medium text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
            >
              Review it →
            </Link>
          </p>
        )}
        {result.error && (
          <p role="alert" className="mt-1 text-small text-attention">
            {result.error}
          </p>
        )}
      </div>
      {!readOnly &&
        choice.kind !== 'approved' &&
        (confirm.asking ? (
          <ConfirmPanel
            confirm={confirm}
            busy={busy}
            label="Draft this week’s report again"
            message={
              choice.kind === 'again' && choice.skipped
                ? 'Draft it again? It goes back to review.'
                : 'Draft it again? Your edits to this week’s report are replaced.'
            }
            confirmLabel="Draft again"
            icon={Sparkles}
            onConfirm={draft}
            className="bg-white"
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            autoFocus={confirm.cancelled}
            disabled={busy}
            onClick={asks ? confirm.ask : draft}
          >
            <BusyIcon icon={Sparkles} busy={busy} />
            {choice.kind === 'new'
              ? 'Draft this week’s report'
              : 'Draft it again'}
          </Button>
        ))}
    </section>
  );
}
