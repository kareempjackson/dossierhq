import type { ReactNode } from 'react';
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

/**
 * The records an answer rests on, as files in a stack: each one's tab says
 * where it came from and when, and the front file shows its title. Shows the
 * last four; screen readers get the full list.
 */
export function CitedStack({
  files,
  className,
}: {
  files: CitedFile[];
  className?: string;
}) {
  const shown = files.slice(-4);
  const fills = FILLS[shown.length] ?? [];

  const layer = (index: number): ReactNode => {
    const file = shown[index];
    if (!file) return null;
    const front = index === shown.length - 1;
    return (
      <div
        className={cn(
          'relative rounded-2xl',
          index === 0 && 'rounded-tl-none',
          !front && 'pt-14',
          fills[index],
        )}
      >
        <span
          className={cn(
            'absolute -top-6 flex h-7 items-start rounded-t-lg px-3 pt-1 text-small whitespace-nowrap',
            fills[index],
          )}
          style={{ left: `${index * 3.25}rem` }}
        >
          {file.source} · {file.date}
        </span>
        {front ? (
          <p className="min-h-36 p-4 font-medium">{file.title}</p>
        ) : (
          layer(index + 1)
        )}
      </div>
    );
  };

  return (
    <div className={className}>
      <div aria-hidden className="pt-6">
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
