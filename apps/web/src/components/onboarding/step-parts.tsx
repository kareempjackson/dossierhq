'use client';

import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';

export const fieldClass =
  'h-10 w-full rounded-input bg-surface px-3 text-body text-ink placeholder:text-muted aria-invalid:outline-2 aria-invalid:outline-alert';
export const labelClass = 'text-meta font-medium text-ink';

/** What every step is handed: the way on, and back when there is one. */
export type StepProps = {
  next: () => void;
  back?: () => void;
};

/** Stable, so React calls it once as the heading appears, not on every render. */
const focusOnMount = (heading: HTMLHeadingElement | null) =>
  heading?.focus({ preventScroll: true });

/** A step's heading. Takes focus as the step comes in, for screen readers. */
export function StepHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header>
      <p className="text-meta font-medium text-brand">{eyebrow}</p>
      <h2
        tabIndex={-1}
        ref={focusOnMount}
        className="mt-2 text-title-compact text-balance outline-none sm:text-title"
      >
        {title}
      </h2>
      {children && <p className="mt-3 max-w-xl text-text">{children}</p>}
    </header>
  );
}

/** Back on the left, the way on at the right. */
export function StepFooter({
  back,
  children,
  className,
}: {
  back?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-6',
        className,
      )}
    >
      {back ? (
        <Button variant="ghost" onClick={back}>
          <ArrowLeft aria-hidden />
          Back
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function StepError({
  id,
  message,
}: {
  id?: string;
  message: string | null;
}) {
  if (!message) return null;
  return (
    <div id={id} role="alert" className="rounded-tile bg-alert-soft px-4 py-3">
      <StatusDot
        tone="failure"
        label={message}
        className="text-meta text-ink"
      />
    </div>
  );
}

/**
 * One choice from a few, as pills: a radio group underneath, so arrow keys
 * move between them. Choosing the chosen one again clears it.
 */
export function ChoiceChips<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  hint,
}: {
  name: string;
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  hint?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={labelClass}>
        {legend}
        {hint && <span className="font-normal text-muted"> {hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'relative inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-body transition-colors',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand',
                checked
                  ? 'bg-ink text-white'
                  : 'bg-surface text-text hover:bg-hairline hover:text-ink',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                onClick={() => checked && onChange(null)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
