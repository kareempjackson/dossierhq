'use client';

import { useActionState, useId } from 'react';
import { signIn, type SignInState } from '@/app/auth-actions';
import { TwoFactorForm } from '@/components/auth/two-factor-form';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

type SignInFormProps = {
  /** Where to go once signed in, already checked to be on this site. */
  next: string;
  /** The last session ended, so say why they're here. */
  expired: boolean;
};

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

export function SignInForm({ next, expired }: SignInFormProps) {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    {},
  );
  const id = useId();
  const ids = {
    email: `${id}-email`,
    password: `${id}-password`,
    error: `${id}-error`,
  };

  const invalid = Boolean(state.error) || undefined;

  if (state.challenge) {
    return <TwoFactorForm challenge={state.challenge} next={next} />;
  }

  return (
    <>
      {expired && !state.error && (
        <p
          role="status"
          className="mt-6 rounded-tile bg-surface px-4 py-3 text-meta text-text"
        >
          Your session ended. Sign in again to carry on.
        </p>
      )}

      <form action={action} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.email} className="text-meta font-medium text-ink">
            Email
          </label>
          <input
            id={ids.email}
            name="email"
            type="email"
            required
            autoComplete="username"
            spellCheck={false}
            defaultValue={state.email}
            aria-invalid={invalid}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={ids.password}
            className="text-meta font-medium text-ink"
          >
            Password
          </label>
          <input
            id={ids.password}
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={invalid}
            className={fieldClass}
          />
        </div>

        {state.error && (
          <div
            id={ids.error}
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
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </>
  );
}
