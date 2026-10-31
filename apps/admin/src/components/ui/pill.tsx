import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const tones = {
  positive: 'bg-brand-soft text-brand-deep',
  neutral: 'bg-surface text-text',
  quiet: 'bg-surface text-muted',
} as const;

const dots = {
  positive: 'bg-brand',
  neutral: 'bg-border-strong',
  quiet: 'bg-border-strong',
} as const;

/** A small rounded label for a state or a role, e.g. "On" or "Admin". */
export function Pill({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: keyof typeof tones;
  /** A dot before the text, for on/off states. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-meta-sm font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span aria-hidden className={cn('size-1.5 rounded-full', dots[tone])} />
      )}
      {children}
    </span>
  );
}
