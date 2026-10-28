'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { draftReports } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { plural } from '@/lib/format';

/**
 * Drafts this week's report now from the latest sync, rather than waiting
 * for Friday. For one client it opens the draft; for every client it says
 * how many it drafted, and the page refreshes to show them. Approved reports
 * are never redrafted.
 */
export function DraftReportsButton({
  clientId,
  label,
}: {
  /** Without one, drafts every client except those approved or skipped. */
  clientId?: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafted, setDrafted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function draft() {
    setError(null);
    setDrafted(null);
    startTransition(async () => {
      const result = await draftReports(clientId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (clientId && result.ids[0]) {
        router.push(`/reports/${encodeURIComponent(result.ids[0])}`);
        return;
      }
      setDrafted(result.ids.length);
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button disabled={pending} onClick={draft}>
        {pending ? 'Drafting…' : label}
      </Button>
      {drafted !== null && (
        <span role="status" className="text-meta text-muted">
          {drafted === 0
            ? 'Nothing to draft. Approved and skipped reports stay as they are.'
            : `Drafted ${plural(drafted, 'report')}.`}
        </span>
      )}
      {error && (
        <span role="alert" className="text-meta text-alert">
          {error}
        </span>
      )}
    </span>
  );
}
