import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SectionHeader } from './section-header';

/** A small titled card, for side columns. */
export function Panel({
  id,
  title,
  note,
  as,
  className,
  children,
}: {
  /** Heading id, for aria-labelledby. */
  id: string;
  title: string;
  note?: ReactNode;
  /** h3 when the page already has its own h2s above. */
  as?: 'h2' | 'h3';
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn('rounded-card bg-sheet p-4 shadow-card', className)}
    >
      <SectionHeader id={id} title={title} note={note} as={as} />
      <div className="mt-3">{children}</div>
    </section>
  );
}
