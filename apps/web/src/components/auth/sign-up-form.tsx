'use client';

import { useActionState, useId, useSyncExternalStore } from 'react';
import { signUp, type SignUpState } from '@/app/auth-actions';
import { NewPasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

const noSubscription = () => () => {};

const fieldClass =
  'h-10 w-full rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

/**
 * Email and password only: the rest comes in onboarding, once the email is
 * confirmed. The browser's time zone goes along for the new workspace.
 */
export function SignUpForm() {
  const [state, action, pending] = useActionState<SignUpState, FormData>(
    signUp,
    {},
  );
  const id = useId();
  // Unknown while rendering on the server; the API falls back to UTC.
  const timeZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => '',
  );
  const errorId = `${id}-error`;

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="timeZone" value={timeZone} />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-email`}
          className="text-meta font-medium text-ink"
        >
          Work email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="username"
          spellCheck={false}
          autoFocus
          placeholder="you@yourmsp.com"
          defaultValue={state.email}
          aria-invalid={state.field === 'email' || undefined}
          aria-describedby={state.field === 'email' ? errorId : undefined}
          className={`${fieldClass} placeholder:text-muted`}
        />
      </div>
      <NewPasswordField
        id={`${id}-password`}
        invalid={state.field === 'password'}
        describedBy={state.field === 'password' ? errorId : undefined}
      />

      {state.error && (
        <div
          id={errorId}
          role="alert"
          className="rounded-tile bg-alert-soft px-4 py-3"
        >
          <StatusDot
            tone="failure"
            label={state.error}
            className="text-meta text-ink"
          />
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        className="mt-1 h-10 w-full"
      >
        {pending ? 'Sending your link…' : 'Create account'}
      </Button>
      <p className="text-center text-meta-sm text-muted">
        We’ll email you a link to confirm it’s your address.
      </p>
    </form>
  );
}
