'use client';

import { useState, useTransition } from 'react';
import {
  decideRecommendation,
  rewordRecommendation,
  type ActionResult,
} from '@/app/(workspace)/clients/actions';
import { Mark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { andList } from '@/lib/client-paths';
import type { OverviewDraft } from '@/lib/client-views';
import { plural } from '@/lib/format';

type Decided = { id: string; title: string; status: 'accepted' | 'dismissed' };

/**
 * Dossier's newest draft recommendation, from the records it cites. Accept,
 * edit or dismiss it; the next draft takes its place, and the decision can
 * be undone from the line it leaves behind.
 */
export function DraftCard({
  draft,
  moreDrafts,
}: {
  draft: OverviewDraft | null;
  /** Drafts waiting behind this one. */
  moreDrafts: number;
}) {
  const [decided, setDecided] = useState<Decided | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, then?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result.ok) then?.();
      else setError(result.error);
    });

  // Until the page reads again, the decided draft is still the one passed in.
  const shown = draft && draft.id !== decided?.id ? draft : null;

  return (
    <>
      {decided && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-lilac-soft px-5 py-4 text-small"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Mark height={12} className="shrink-0 text-lilac-ink" />
            <span className="min-w-0">
              {decided.status === 'accepted' ? 'Accepted' : 'Dismissed'} “
              {decided.title}”.
            </span>
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => decideRecommendation(decided.id, 'draft'),
                () => setDecided(null),
              )
            }
            className="rounded-sm font-medium underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink disabled:opacity-60"
          >
            Undo
          </button>
        </div>
      )}

      {shown && (
        <div
          id="draft"
          aria-busy={pending || undefined}
          className="scroll-mt-6 rounded-2xl bg-linear-to-br from-lilac-mist to-lilac-soft p-5"
        >
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-lilac-ink">
            <Mark height={12} />
            {shown.from.length > 0
              ? `Dossier drafted this, from ${andList(shown.from.map(String))}`
              : 'Dossier drafted this'}
            {moreDrafts > 0 && (
              <span className="text-muted">
                · {plural(moreDrafts, 'more draft')} after it
              </span>
            )}
          </p>
          {editing !== null ? (
            <textarea
              autoFocus
              aria-label="Draft"
              rows={3}
              maxLength={200}
              value={editing}
              onChange={(event) => setEditing(event.target.value)}
              className="mt-3 w-full resize-none rounded-xl bg-white/80 p-3 font-display text-h3 outline-none focus-visible:ring-2 focus-visible:ring-lilac-deep"
            />
          ) : (
            <p className="mt-2 font-display text-h3">{shown.title}</p>
          )}
          <p className="mt-2 text-small text-muted">{shown.reason}</p>
          {error && (
            <p role="alert" className="mt-3 text-small text-attention">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {editing !== null ? (
              <>
                <Button
                  variant="ink"
                  size="sm"
                  disabled={pending || !editing.trim()}
                  onClick={() =>
                    run(
                      () => rewordRecommendation(shown.id, editing.trim()),
                      () => setEditing(null),
                    )
                  }
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setEditing(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ink"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => decideRecommendation(shown.id, 'accepted'),
                      () =>
                        setDecided({
                          id: shown.id,
                          title: shown.title,
                          status: 'accepted',
                        }),
                    )
                  }
                >
                  Accept draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setEditing(shown.title)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => decideRecommendation(shown.id, 'dismissed'),
                      () =>
                        setDecided({
                          id: shown.id,
                          title: shown.title,
                          status: 'dismissed',
                        }),
                    )
                  }
                >
                  Dismiss
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
