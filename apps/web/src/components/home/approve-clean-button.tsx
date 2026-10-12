'use client';

import { Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { setReportsStatus } from '@/app/actions';
import { Button } from '@/components/ui/button';

/**
 * Approves every clean report in one go, with Undo. Stays mounted after the
 * page refreshes (when there may be no clean reports left), so Undo survives.
 */
export function ApproveCleanButton({ ids }: { ids: string[] }) {
  const [approved, setApproved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(batch: string[], status: 'approved' | 'draft') {
    setError(null);
    startTransition(async () => {
      const result = await setReportsStatus(batch, status);
      if (!result.ok) setError(result.error);
      else setApproved(status === 'approved' ? batch : []);
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {approved.length > 0 ? (
        <>
          <span
            role="status"
            className="inline-flex h-9 items-center gap-1.5 px-2 text-body font-medium text-brand-deep"
          >
            <Check aria-hidden className="size-4" strokeWidth={2} />
            {approved.length} approved
          </span>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => change(approved, 'draft')}
          >
            Undo
          </Button>
        </>
      ) : (
        ids.length > 0 && (
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => change(ids, 'approved')}
          >
            {pending ? 'Approving…' : `Approve ${ids.length} clean`}
          </Button>
        )
      )}
      {error && (
        <span role="alert" className="text-meta text-alert">
          {error}
        </span>
      )}
    </span>
  );
}
