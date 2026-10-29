'use client';

import type {
  Recommendation,
  RecommendationUpdate,
  Source,
} from '@dossierhq/contracts';
import { Check } from 'lucide-react';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { updateRecommendation } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { SourceList } from '@/components/ui/source-list';

/**
 * A drafted recommendation with the evidence behind it. Accepting or
 * dismissing saves through the API; the card then moves to "Decided this
 * week" when the page refreshes.
 */
export function RecommendationCard({
  recommendation,
  sources,
  timeZone,
}: {
  recommendation: Recommendation;
  sources: Source[];
  timeZone: string;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ids = { title: useId(), reason: useId() };

  function save(update: RecommendationUpdate, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await updateRecommendation(recommendation.id, update);
      if (!result.ok) setError(result.error);
      else after?.();
    });
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    save(
      {
        title: String(data.get('title') ?? ''),
        reason: String(data.get('reason') ?? ''),
      },
      () => setEditing(false),
    );
  }

  return (
    <li className="rounded-card bg-sheet p-4 shadow-card">
      {editing ? (
        <form onSubmit={saveEdit} className="flex flex-col gap-3">
          <label htmlFor={ids.title} className="text-meta font-medium text-ink">
            Recommendation
          </label>
          <input
            id={ids.title}
            name="title"
            defaultValue={recommendation.title}
            required
            maxLength={200}
            className="-mt-1.5 h-10 rounded-input bg-surface px-3 text-body text-ink"
          />
          <label
            htmlFor={ids.reason}
            className="text-meta font-medium text-ink"
          >
            Why
          </label>
          <textarea
            id={ids.reason}
            name="reason"
            defaultValue={recommendation.reason}
            required
            maxLength={1000}
            rows={3}
            className="-mt-1.5 resize-y rounded-input bg-surface px-3 py-2 text-body text-ink"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium">{recommendation.title}</h3>
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-px text-meta-sm text-muted">
              Draft
            </span>
          </div>
          <p className="mt-1.5 text-meta text-text">{recommendation.reason}</p>
        </>
      )}

      <div className="mt-4 rounded-tile bg-surface-soft p-3">
        <p className="text-meta-sm font-medium text-muted">
          Why Dossier suggests it
        </p>
        <SourceList sources={sources} timeZone={timeZone} className="mt-2" />
      </div>

      {!editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            disabled={pending}
            onClick={() => save({ status: 'accepted' })}
          >
            <Check aria-hidden />
            Accept
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => save({ status: 'dismissed' })}
          >
            Dismiss
          </Button>
          {pending && (
            <span role="status" className="text-meta text-muted">
              Saving…
            </span>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-meta text-alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** One accepted or dismissed recommendation, with Undo back to draft. */
export function DecidedRecommendation({
  recommendation,
  decidedLabel,
}: {
  recommendation: Recommendation;
  /** e.g. "Accepted 9 Oct" */
  decidedLabel: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function undo() {
    setError(null);
    startTransition(async () => {
      const result = await updateRecommendation(recommendation.id, {
        status: 'draft',
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-meta text-ink">{recommendation.title}</p>
        <p className="text-meta-sm text-muted">{decidedLabel}</p>
        {error && (
          <p role="alert" className="text-meta-sm text-alert">
            {error}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={undo}
        aria-label={`Undo: ${recommendation.title}`}
      >
        {pending ? 'Undoing…' : 'Undo'}
      </Button>
    </li>
  );
}
