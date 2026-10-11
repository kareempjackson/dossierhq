import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SectionHeaderProps = {
  /** Pair with `aria-labelledby` on the section. */
  id: string;
  title: string;
  count?: number;
  /** Quiet text or a link on the right. */
  note?: ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
};

export function SectionHeader({
  id,
  title,
  count,
  note,
  as: Heading = 'h2',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1',
        className,
      )}
    >
      <Heading id={id} className="text-section font-semibold text-ink">
        {title}
        {count !== undefined && ' '}
        {count !== undefined && (
          <span className="ml-1 font-normal text-muted tabular-nums">
            {count}
          </span>
        )}
      </Heading>
      {note && <div className="text-meta text-muted">{note}</div>}
    </div>
  );
}
