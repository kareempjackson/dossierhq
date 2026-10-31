'use client';

import { Check, Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';

/** What the API asks of a new password. */
export const MIN_PASSWORD = 12;

const LEVELS = [
  { label: 'Too short', tone: 'bg-alert' },
  { label: 'Fair', tone: 'bg-marker' },
  { label: 'Good', tone: 'bg-brand' },
  { label: 'Strong', tone: 'bg-brand' },
] as const;

/**
 * A rough guide, not a rule: length counts most, then mixing kinds of
 * character or words. 0 is under the minimum.
 */
function strength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < MIN_PASSWORD) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /\s/].filter((kind) =>
    kind.test(password),
  ).length;
  const score = (password.length >= 16 ? 1 : 0) + (kinds >= 3 ? 1 : 0);
  return (1 + score) as 1 | 2 | 3;
}

/**
 * A password someone is choosing: shown or hidden on request, with a meter
 * and the one rule the API checks.
 */
export function NewPasswordField({
  id,
  label = 'Password',
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string;
  label?: string;
  invalid?: boolean;
  /** The id of an error about this field, when there is one. */
  describedBy?: string;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [value, setValue] = useState('');
  const hintId = useId();
  const level = strength(value);
  const long = value.length >= MIN_PASSWORD;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name="password"
          type={shown ? 'text' : 'password'}
          required
          minLength={MIN_PASSWORD}
          maxLength={200}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={[hintId, describedBy].filter(Boolean).join(' ')}
          className="h-10 w-full rounded-input bg-surface pr-11 pl-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert"
        />
        <button
          type="button"
          onClick={() => setShown((was) => !was)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-input text-muted transition-colors hover:text-ink"
        >
          {shown ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </button>
      </div>
      <div id={hintId} className="flex items-center gap-3">
        <div aria-hidden className="flex flex-1 gap-1">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-300',
                value && step <= Math.max(level, 1)
                  ? LEVELS[level].tone
                  : 'bg-surface',
              )}
            />
          ))}
        </div>
        <p
          className={cn(
            'flex shrink-0 items-center gap-1 text-meta-sm',
            long ? 'text-brand' : 'text-muted',
          )}
        >
          {long ? (
            <>
              <Check aria-hidden className="size-3.5" />
              {LEVELS[level].label}
            </>
          ) : (
            `At least ${MIN_PASSWORD} characters`
          )}
        </p>
      </div>
    </div>
  );
}
