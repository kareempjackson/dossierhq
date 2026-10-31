'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

const LENGTH = 6;

/**
 * A 6-digit code from an authenticator app, drawn as six boxes over one
 * real input, so typing, pasting and the phone's code suggestion all work.
 * Calls `onComplete` once all six are in.
 */
export function CodeInput({
  id,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative w-fit">
      <div aria-hidden className="flex gap-2">
        {Array.from({ length: LENGTH }, (_, index) => {
          const current =
            focused &&
            (index === value.length ||
              (value.length === LENGTH && index === LENGTH - 1));
          return (
            <span
              key={index}
              className={cn(
                'grid h-14 w-11 place-items-center rounded-input bg-surface font-mono text-figure text-ink tabular-nums transition-shadow sm:w-12',
                index === 2 && 'mr-2',
                current && 'ring-2 ring-brand',
                invalid && !current && 'ring-2 ring-alert',
              )}
            >
              {value[index] ??
                (current ? (
                  <span className="h-6 w-px bg-ink motion-safe:animate-pulse" />
                ) : null)}
            </span>
          );
        })}
      </div>
      <input
        id={id}
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, LENGTH);
          onChange(digits);
          if (digits.length === LENGTH) onComplete(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={LENGTH}
        required
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-default"
      />
    </div>
  );
}
