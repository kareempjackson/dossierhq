'use client';

import { CheckCheck } from 'lucide-react';
import { useState, useTransition } from 'react';
import { approveClean } from '@/app/(workspace)/reports/actions';
import { Button } from '@/components/ui/button';
import { ConfirmPanel, useConfirm } from '@/components/ui/inline-confirm';
import { useAppSelector } from '@/lib/store/hooks';
import { selectReports } from '@/lib/store/reports-slice';
import { selectSupport } from '@/lib/store/session-slice';

/**
 * Approves every draft to review that has nothing to check, after asking.
 * Drafts with something to check stay for a person to read. Hidden in a
 * support view, which can't change things.
 */
export function ApproveCleanButton() {
  const reports = useAppSelector(selectReports);
  const support = useAppSelector(selectSupport);
  const confirm = useConfirm();
  const [busy, startApproving] = useTransition();
  const [note, setNote] = useState<{ error?: string; done?: string }>({});

  if (support) return null;
  const ready = reports.status === 'ready' ? reports : null;
  const clean = ready?.queue.filter((item) => item.checks === 0) ?? [];
  const count = clean.length;

  const approve = () =>
    startApproving(async () => {
      setNote({});
      const result = await approveClean(clean.map((item) => item.id));
      confirm.cancel();
      setNote(
        result.ok
          ? {
              done:
                result.approved === 1
                  ? 'Approved 1 report.'
                  : `Approved ${result.approved} reports.`,
            }
          : { error: result.error },
      );
    });

  return (
    // It shares a row with Draft reports now; on a phone the confirm
    // shrinks and wraps into the room left, rather than widen the page.
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3">
      {note.error && (
        <p role="alert" className="text-[0.75rem] text-attention">
          {note.error}
        </p>
      )}
      {note.done && (
        <p role="status" className="text-[0.75rem] text-healthy">
          {note.done}
        </p>
      )}
      {count > 0 &&
        (confirm.asking ? (
          <ConfirmPanel
            confirm={confirm}
            busy={busy}
            label="Approve the clean reports"
            message={`Approve ${count === 1 ? 'the 1 report' : `${count} reports`} with nothing to check? ${
              ready?.sends
                ? `They go ${ready.sends}.`
                : 'They wait in Approved for someone to send them.'
            }`}
            confirmLabel="Approve"
            icon={CheckCheck}
            onConfirm={approve}
            fill={false}
            className="min-w-0 bg-white"
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            autoFocus={confirm.cancelled}
            disabled={busy}
            onClick={confirm.ask}
          >
            <CheckCheck aria-hidden className="size-4" strokeWidth={1.75} />
            Approve {count} clean
          </Button>
        ))}
    </div>
  );
}
