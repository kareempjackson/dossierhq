'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

export type CleanReportItem = {
  id: string;
  clientName: string;
  href: string;
  /** e.g. "24 devices · 100% patched · 3 alerts" */
  summary: string;
};

/**
 * Clean reports with checkboxes and one bulk Approve. Approval is UI only
 * until the reports API exists.
 */
export function CleanReports({ items }: { items: CleanReportItem[] }) {
  const [selected, setSelected] = useState(
    () => new Set(items.map((i) => i.id)),
  );
  const [approved, setApproved] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const waiting = items.filter((item) => !approved.has(item.id));
  const chosen = waiting.filter((item) => selected.has(item.id));
  const allChosen = waiting.length > 0 && chosen.length === waiting.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        chosen.length > 0 && chosen.length < waiting.length;
    }
  }, [chosen.length, waiting.length]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allChosen ? new Set() : new Set(waiting.map((item) => item.id)),
    );
  }

  function approveChosen() {
    setApproved((current) => new Set([...current, ...chosen.map((i) => i.id)]));
  }

  return (
    <div className="overflow-hidden rounded-card bg-sheet shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <label className="flex items-center gap-2.5 text-meta text-text">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allChosen}
            onChange={toggleAll}
            disabled={waiting.length === 0}
            className="size-4 accent-brand"
          />
          Select all
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {approved.size > 0 && (
            <>
              <span role="status" className="text-meta text-brand-deep">
                {approved.size} approved
              </span>
              <Button variant="ghost" onClick={() => setApproved(new Set())}>
                Undo
              </Button>
            </>
          )}
          {waiting.length > 0 && (
            <Button
              variant="primary"
              disabled={chosen.length === 0}
              onClick={approveChosen}
            >
              {chosen.length > 0
                ? `Approve ${chosen.length} selected`
                : 'Approve selected'}
            </Button>
          )}
        </div>
      </div>
      <ul className="divide-y divide-hairline">
        {items.map((item) => {
          const done = approved.has(item.id);
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <label className="flex min-w-0 flex-1 items-center gap-3">
                {done ? (
                  <StatusDot tone="positive" decorative className="px-1" />
                ) : (
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="size-4 shrink-0 accent-brand"
                  />
                )}
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {item.clientName}
                  </span>
                  <span className="block text-meta text-muted">
                    {done ? 'Approved' : item.summary}
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
          );
        })}
      </ul>
    </div>
  );
}
