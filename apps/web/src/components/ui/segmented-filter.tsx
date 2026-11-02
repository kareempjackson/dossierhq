'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { cn } from '@/lib/cn';

type Option = { value: string; label: string; href: string; count?: number };

type SegmentedFilterProps = {
  /** Names the group, e.g. "Filter reports". */
  label: string;
  options: Option[];
  value: string;
  className?: string;
};

/**
 * A compact set of mutually exclusive filters. Each option is a link, so the
 * filter lives in the URL and works without JavaScript.
 *
 * The page only renders the new filter once the server has, which can take a
 * moment, so the clicked option is selected straight away and the group
 * carries `data-pending` until the page catches up. Pages dim what's about to
 * change with `group-has-data-pending:`.
 */
export function SegmentedFilter({
  label,
  options,
  value,
  className,
}: SegmentedFilterProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(value);

  return (
    <nav
      aria-label={label}
      data-pending={pending ? '' : undefined}
      className={cn('inline-flex rounded-full bg-surface p-1', className)}
    >
      <ul className="flex flex-wrap gap-0.5">
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <li key={option.value}>
              <Link
                href={option.href}
                aria-current={active ? 'true' : undefined}
                scroll={false}
                onNavigate={(event) => {
                  // Navigate inside our own transition, so `selected` and
                  // `pending` hold until the new page arrives.
                  event.preventDefault();
                  startTransition(() => {
                    setSelected(option.value);
                    router.push(option.href, { scroll: false });
                  });
                }}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-full px-3 text-meta transition-colors',
                  active
                    ? 'bg-sheet text-ink shadow-card'
                    : 'text-muted hover:text-ink',
                )}
              >
                {option.label}
                {option.count !== undefined && (
                  <span className="text-muted tabular-nums">
                    {option.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
