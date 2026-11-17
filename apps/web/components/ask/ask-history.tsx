'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Mark } from '@/components/brand/logo';
import type { AskRow, AskState } from '@/lib/ask-views';
import { cn } from '@/lib/cn';
import { CopyLinkButton } from './copy-link-button';

const FILTERS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'mine', label: 'Mine' },
] as const;

/** A question that isn't plainly answered says where it stands. */
const STATE_NOTE: Partial<Record<AskState, string>> = {
  answering: 'Answering…',
  'not-found': 'Not in the records',
  failed: 'Couldn’t answer',
};

/**
 * Every question asked here, or only yours. Each row opens its answer. Both
 * lists come from the server at once, so switching is instant.
 */
export function AskHistory({
  everyone,
  mine,
}: {
  everyone: AskRow[];
  mine: AskRow[];
}) {
  const [who, setWho] = useState<(typeof FILTERS)[number]['value']>('everyone');
  const shown = who === 'mine' ? mine : everyone;

  return (
    <>
      <div role="group" aria-label="Whose questions" className="flex gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            aria-pressed={who === filter.value}
            onClick={() => setWho(filter.value)}
            className={cn(
              'rounded-full px-3 py-1 text-small transition-colors',
              who === filter.value
                ? 'bg-white text-ink ring-1 ring-grey-3'
                : 'bg-grey-2 text-muted hover:text-ink',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2.5">
          {shown.map((item) => {
            const note = STATE_NOTE[item.state];
            return (
              <li
                key={item.id}
                className="relative flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-grey-1 px-4 py-3.5 transition-colors hover:bg-grey-2"
              >
                <Mark height={14} className="text-ink" />
                <div className="min-w-[12rem] flex-1">
                  {/* The whole row opens the answer; Copy link sits above it. */}
                  <Link
                    href={`/ask/${encodeURIComponent(item.id)}`}
                    className="rounded-sm font-medium after:absolute after:inset-0 after:rounded-xl"
                  >
                    {item.question}
                  </Link>
                  <p className="text-small text-muted">
                    {item.askedBy} ·{' '}
                    <span title={item.askedAtFull}>{item.askedAt}</span>
                  </p>
                </div>
                {(note || item.scope) && (
                  <p className="text-small text-muted">{note ?? item.scope}</p>
                )}
                <CopyLinkButton
                  path={`/ask/${encodeURIComponent(item.id)}`}
                  className="relative z-10"
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
          {who === 'mine'
            ? 'You haven’t asked anything yet. Ask above; every answer cites its records.'
            : 'Nobody has asked anything yet. Ask above; every answer cites its records.'}
        </p>
      )}
    </>
  );
}
