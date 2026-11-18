'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CitedFile = {
  /**
   * The record's id. Two records can share a tool, date and title (say,
   * two tickets with the same subject on one day), so pass it when known.
   */
  id?: string;
  source: string;
  date: string;
  title: string;
};

/** Back to front, by how many files show: lilac at the back, grey in front. */
const FILLS: Record<number, string[]> = {
  1: ['bg-grey-3'],
  2: ['bg-stone', 'bg-grey-3'],
  3: ['bg-lilac', 'bg-stone', 'bg-grey-3'],
  4: ['bg-lilac', 'bg-stone', 'bg-grey-3', 'bg-grey-2'],
};

/** The most tabs the stack shows. */
const SHOWN = 4;
/** Titles the front file lists for a day before counting the rest. */
const LISTED = 3;

/**
 * The files the stack shows: the last few, one for each date, since a tab
 * that repeats the one beside it says nothing new. The front file (the last)
 * always shows; the rest keep their order.
 */
function oneADate(files: CitedFile[]): CitedFile[] {
  const shown: CitedFile[] = [];
  const dates = new Set<string>();
  for (let index = files.length - 1; index >= 0; index--) {
    const file = files[index]!;
    if (dates.has(file.date)) continue;
    dates.add(file.date);
    shown.unshift(file);
    if (shown.length === SHOWN) break;
  }
  return shown;
}

/**
 * The records an answer rests on, as files in a stack: each one's tab says
 * where it came from and when, one tab a date, and the front file shows
 * what was cited that day. Choosing a tab shows its day; the tabs stay where
 * they are, so the next is easy to choose. Screen readers also get the full
 * list.
 */
export function CitedStack({
  files,
  className,
}: {
  files: CitedFile[];
  className?: string;
}) {
  const shown = oneADate(files);
  const fills = FILLS[shown.length] ?? [];
  const front = shown.length - 1;
  const [chosen, choose] = useState<string | null>(null);
  // The day being read: the one chosen, while it's still cited, or the
  // front file's.
  const found =
    chosen === null ? -1 : shown.findIndex((file) => file.date === chosen);
  const selected = found === -1 ? front : found;
  const day = shown[selected]?.date;
  // That day's records, the first cited first.
  const onThatDay = files.filter((file) => file.date === day).reverse();
  const sources = new Set(onThatDay.map((file) => file.source));

  const layer = (index: number): ReactNode => {
    const file = shown[index];
    if (!file) return null;
    const isFront = index === front;
    const pressed = index === selected;
    const pick = () => choose(file.date);
    // A folder lifts its tab while any of it that shows is hovered, like a
    // file pulled up from the stack; the chosen one stays a little raised.
    // The tab overlaps its folder by 8px, so the lift never leaves a gap.
    const tab = cn(
      'absolute -top-6 flex h-8 items-start rounded-t-lg px-3 pt-1 text-small whitespace-nowrap transition duration-200 ease-out',
      'group-hover/fold:-translate-y-1.5 group-hover/fold:text-ink group-active/fold:translate-y-0 group-active/fold:duration-75',
      'group-focus-visible/fold:-translate-y-1.5 group-focus-visible/fold:ring-2 group-focus-visible/fold:ring-lilac-deep',
      'motion-reduce:transition-none motion-reduce:group-hover/fold:translate-y-0',
      fills[index],
      pressed ? '-translate-y-0.5 font-medium text-ink' : 'text-ink/60',
    );
    const label = (
      <span className={tab} style={{ left: `${index * 3.25}rem` }}>
        {file.source} · {file.date}
      </span>
    );
    return (
      <div
        className={cn(
          'relative rounded-2xl',
          index === 0 && 'rounded-tl-none',
          !isFront && 'pt-14',
          fills[index],
        )}
      >
        {isFront ? (
          // The front file: its tab, and the card that shows the chosen day.
          // Clicking anywhere on it comes back to its own day.
          <div className="group/fold cursor-pointer" onClick={pick}>
            {/* Only the tab: the strip above the card is the folder behind. */}
            <button
              type="button"
              aria-pressed={pressed}
              onClick={pick}
              className={cn(
                tab,
                'cursor-pointer focus-visible:-translate-y-1.5 focus-visible:ring-2 focus-visible:ring-lilac-deep focus-visible:outline-none',
              )}
              style={{ left: `${index * 3.25}rem` }}
            >
              {file.source} · {file.date}
            </button>
            <div aria-live="polite" className="min-h-36 p-4">
              {/* Keyed by day, so a new day fades in. */}
              <div key={day} className="animate-enter">
                {selected !== front && (
                  <p className="mb-1 text-[0.75rem] text-muted">
                    {sources.size === 1 ? `${[...sources][0]} · ` : ''}
                    {day}
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {onThatDay.slice(0, LISTED).map((each, at) => (
                    <li key={each.id ?? `${at}-${each.title}`}>
                      <p className="font-medium">{each.title}</p>
                      {sources.size > 1 && (
                        <p className="text-[0.75rem] text-muted">
                          {each.source}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {onThatDay.length > LISTED && (
                  <p className="mt-2 text-small text-muted">
                    {onThatDay.length - LISTED} more that day
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* A folder behind: its tab and the strip of it that shows. */}
            <button
              type="button"
              aria-pressed={pressed}
              onClick={pick}
              className="group/fold absolute inset-x-0 top-0 h-14 cursor-pointer focus-visible:outline-none"
            >
              {label}
            </button>
            {layer(index + 1)}
          </>
        )}
      </div>
    );
  };

  return (
    <div className={className}>
      <div role="group" aria-label="Cited files, by day" className="pt-6">
        {layer(0)}
      </div>
      <ul className="sr-only">
        {files.map((file, index) => (
          <li key={file.id ?? `${index}-${file.source}-${file.date}`}>
            {file.title}, from {file.source} on {file.date}
          </li>
        ))}
      </ul>
    </div>
  );
}
