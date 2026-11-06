'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Mark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/lib/store/hooks';
import { selectUser } from '@/lib/store/session-slice';
import type { Ask } from '@/lib/workspace';
import { CopyLinkButton } from './copy-link-button';

const FILTERS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'mine', label: 'Mine' },
] as const;

/** Every question asked here, or only yours. Each row opens its answer. */
export function AskHistory({ asks }: { asks: Ask[] }) {
  const me = useAppSelector(selectUser)?.name;
  const [who, setWho] = useState<(typeof FILTERS)[number]['value']>('everyone');
  const shown =
    who === 'mine' ? asks.filter((item) => item.askedBy === me) : asks;

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
          {shown.map((item) => (
            <li
              key={item.id}
              className="relative flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-grey-1 px-4 py-3.5 transition-colors hover:bg-grey-2"
            >
              <Mark height={14} className="text-ink" />
              <div className="min-w-[12rem] flex-1">
                {/* The whole row opens the answer; Copy link sits above it. */}
                <Link
                  href={`/ask/${item.id}`}
                  className="rounded-sm font-medium after:absolute after:inset-0 after:rounded-xl"
                >
                  {item.title}
                </Link>
                <p className="text-small text-muted">
                  {item.askedBy} · {item.askedAt}
                </p>
              </div>
              <p className="text-small text-muted">{item.scope}</p>
              <CopyLinkButton
                path={`/ask/${item.id}`}
                className="relative z-10"
              />
            </li>
          ))}
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
