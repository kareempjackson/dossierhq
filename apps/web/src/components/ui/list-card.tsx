import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ListCardProps = {
  /** `float` lifts the list above the sheet, for the list that matters most. */
  elevation?: 'card' | 'float';
  className?: string;
  children: ReactNode;
};

/** A white card of rows separated by hairlines. Children are ListCardRows. */
export function ListCard({
  elevation = 'card',
  className,
  children,
}: ListCardProps) {
  return (
    <ul
      className={cn(
        'divide-y divide-hairline overflow-hidden rounded-card bg-sheet',
        elevation === 'float' ? 'shadow-float' : 'shadow-card',
        className,
      )}
    >
      {children}
    </ul>
  );
}

type ListCardRowProps = {
  /** Makes the whole row a link. */
  href?: string;
  className?: string;
  children: ReactNode;
};

export function ListCardRow({ href, className, children }: ListCardRowProps) {
  const rowClass = cn('flex gap-3 px-4 py-3.5', className);

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            rowClass,
            'transition-colors -outline-offset-2 hover:bg-surface-soft',
          )}
        >
          {children}
        </Link>
      ) : (
        <div className={rowClass}>{children}</div>
      )}
    </li>
  );
}
