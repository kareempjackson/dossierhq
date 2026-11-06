'use client';

import { cn } from '@/lib/cn';

/** An on/off switch: ink when on, stone when off. Its label comes from aria-labelledby. */
export function Switch({
  checked,
  onChange,
  labelledBy,
  describedBy,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-ink' : 'bg-stone',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
