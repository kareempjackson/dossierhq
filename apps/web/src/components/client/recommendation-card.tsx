'use client';

import type { Recommendation, Source } from '@dossierhq/contracts';
import { Check } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { SourceChip } from '@/components/ui/source-chip';
import { SourceLine } from '@/components/ui/source-line';
import { sourceName } from '@/lib/sources';

type CardState = 'draft' | 'editing' | 'accepted' | 'dismissed';

/**
 * A drafted recommendation with the evidence behind it. Accept, Edit and
 * Dismiss change only this card until the API exists.
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
  const [state, setState] = useState<CardState>('draft');
  const [title, setTitle] = useState(recommendation.title);
  const [reason, setReason] = useState(recommendation.reason);
  const ids = { title: useId(), reason: useId() };

  if (state === 'dismissed') {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface-soft px-4 py-2.5">
        <p role="status" className="text-meta text-muted">
          Dismissed: {title}
        </p>
        <Button variant="ghost" onClick={() => setState('draft')}>
          Undo
        </Button>
      </li>
    );
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setTitle(String(data.get('title') ?? title).trim() || title);
    setReason(String(data.get('reason') ?? reason).trim() || reason);
    setState('draft');
  }

  return (
    <li className="rounded-card bg-sheet p-4 shadow-card">
      {state === 'editing' ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          <label htmlFor={ids.title} className="text-meta font-medium text-ink">
            Recommendation
          </label>
          <input
            id={ids.title}
            name="title"
            defaultValue={title}
            required
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
            defaultValue={reason}
            rows={3}
            className="-mt-1.5 resize-y rounded-input bg-surface px-3 py-2 text-body text-ink"
          />
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            <Button variant="ghost" onClick={() => setState('draft')}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium">{title}</h3>
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-px text-meta-sm text-muted">
              {state === 'accepted' ? 'Accepted' : 'Draft'}
            </span>
          </div>
          <p className="mt-1.5 text-meta text-text">{reason}</p>
        </>
      )}

      <div className="mt-4 rounded-tile bg-surface-soft p-3">
        <p className="text-meta-sm font-medium text-muted">
          Why Dossier suggests it
        </p>
        <ol className="mt-2 flex flex-col gap-3">
          {sources.map((source, index) => (
            <li key={source.id} className="flex gap-2.5">
              <SourceChip
                number={index + 1}
                label={sourceName(source)}
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0">
                {source.kind === 'meeting' ? (
                  <blockquote className="text-meta text-ink">
                    “{source.quote}”
                  </blockquote>
                ) : (
                  <p className="text-meta text-ink">{source.title}</p>
                )}
                <SourceLine
                  source={source}
                  timeZone={timeZone}
                  className="mt-0.5"
                />
              </div>
            </li>
          ))}
        </ol>
      </div>

      {state !== 'editing' && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {state === 'accepted' ? (
            <>
              <span
                role="status"
                className="inline-flex h-9 items-center gap-1.5 px-1 text-body font-medium text-brand-deep"
              >
                <Check aria-hidden className="size-4" strokeWidth={2} />
                Accepted
              </span>
              <Button variant="ghost" onClick={() => setState('draft')}>
                Undo
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setState('accepted')}>
                <Check aria-hidden />
                Accept
              </Button>
              <Button variant="ghost" onClick={() => setState('editing')}>
                Edit
              </Button>
              <Button variant="ghost" onClick={() => setState('dismissed')}>
                Dismiss
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
