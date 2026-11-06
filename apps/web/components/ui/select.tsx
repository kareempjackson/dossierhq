import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** A native select dressed like Input, with its own chevron. */
export function Select({
  className,
  children,
  ...props
}: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-11 w-full appearance-none rounded-xl bg-grey-1 pr-10 pl-4 text-body text-ink transition-colors aria-invalid:bg-attention-soft focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-lilac-deep focus-visible:outline-none focus-visible:ring-inset',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted"
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
