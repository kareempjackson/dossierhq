import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SectionHeader } from './section-header';

/** A small titled card, for side columns. */
export function Panel({
  id,
  title,
  note,
  className,
  children,
}: {
  /** Heading id, for aria-labelledby. */
  id: string;
  title: string;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn('rounded-card bg-sheet p-4 shadow-card', className)}
    >
      <SectionHeader id={id} title={title} note={note} />
      <div className="mt-3">{children}</div>
    </section>
  );
}
