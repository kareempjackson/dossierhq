import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * A native select dressed like Input, with its own chevron. Compact sits in
 * a row beside a small button.
 */
export function Select({
  className,
  children,
  compact = false,
  ...props
}: ComponentProps<'select'> & { compact?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cn(
          'w-full appearance-none bg-grey-1 pr-10 text-ink transition-colors aria-invalid:bg-attention-soft focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-lilac-deep focus-visible:outline-none focus-visible:ring-inset',
          compact
            ? 'h-7 rounded-lg pl-3 text-small'
            : 'h-11 rounded-xl pl-4 text-body',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted',
          compact ? 'right-3 size-3.5' : 'right-4 size-4',
        )}
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
