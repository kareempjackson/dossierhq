import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { RetryButton } from './retry-button';
import { StatusDot } from './status-dot';

/** A list with nothing in it, and what that means. */
export function EmptyState({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-card bg-surface-soft px-5 py-8 text-center',
        className,
      )}
    >
      <p className="font-medium text-ink">{title}</p>
      {children && (
        <p className="mx-auto mt-1 max-w-md text-meta text-muted">{children}</p>
      )}
    </div>
  );
}

/** A list that failed to load, with a way to try again. */
export function ErrorState({
  what,
  className,
}: {
  /** What failed to load, e.g. "recommendations". */
  what: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-card bg-alert-soft py-2 pr-2 pl-4',
        className,
      )}
    >
      <StatusDot
        tone="failure"
        label={`Couldn’t load ${what}.`}
        className="text-meta text-ink"
      />
      <RetryButton />
    </div>
  );
}

/** A placeholder bar while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-row bg-surface motion-safe:animate-pulse',
        className,
      )}
    />
  );
}

/** Announces loading to screen readers alongside skeletons. */
export function LoadingLabel({ what }: { what: string }) {
  return (
    <span role="status" className="sr-only">
      Loading {what}
    </span>
  );
}
