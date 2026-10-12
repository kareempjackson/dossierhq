'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { setReportsStatus } from '@/app/actions';
import { Button } from '@/components/ui/button';

export type CleanReportItem = {
  id: string;
  clientName: string;
  href: string;
  /** e.g. "24 devices · 100% patched · 3 alerts" */
  summary: string;
};

/**
 * Clean reports with checkboxes and one bulk Approve. Approved reports leave
 * the list when the page refreshes; the banner keeps an Undo for them.
 */
export function CleanReports({ items }: { items: CleanReportItem[] }) {
  // Everything starts selected; reports that come back after Undo still are.
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());
  const [approved, setApproved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const chosen = items.filter((item) => !deselected.has(item.id));
  const allChosen = items.length > 0 && chosen.length === items.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        chosen.length > 0 && chosen.length < items.length;
    }
  }, [chosen.length, items.length]);

  function toggle(id: string) {
    setDeselected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function change(ids: string[], status: 'approved' | 'draft') {
    setError(null);
    startTransition(async () => {
      const result = await setReportsStatus(ids, status);
      if (!result.ok) setError(result.error);
      else setApproved(status === 'approved' ? ids : []);
    });
  }

  return (
    <div className="overflow-hidden rounded-card bg-sheet shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <label className="flex items-center gap-2.5 text-meta text-text">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allChosen}
            onChange={() =>
              setDeselected(
                allChosen ? new Set(items.map((item) => item.id)) : new Set(),
              )
            }
            disabled={items.length === 0 || pending}
            className="size-4 accent-brand"
          />
          Select all
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {approved.length > 0 && (
            <>
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-meta text-brand-deep"
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
          )}
          {items.length > 0 && (
            <Button
              variant="primary"
              disabled={chosen.length === 0 || pending}
              onClick={() =>
                change(
                  chosen.map((item) => item.id),
                  'approved',
                )
              }
            >
              {pending
                ? 'Saving…'
                : chosen.length > 0
                  ? `Approve ${chosen.length} selected`
                  : 'Approve selected'}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="border-b border-hairline bg-alert-soft px-4 py-2 text-meta text-ink"
        >
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-meta text-muted">
          No clean reports waiting.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={!deselected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  disabled={pending}
                  className="size-4 shrink-0 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {item.clientName}
                  </span>
                  <span className="block text-meta text-muted">
                    {item.summary}
                  </span>
                </span>
              </label>
              <Link
                href={item.href}
                className="shrink-0 rounded-row text-meta text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Open<span className="sr-only"> {item.clientName} report</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
