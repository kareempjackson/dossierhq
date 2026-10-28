'use client';

import { useActionState, useId } from 'react';
import { completeTwoFactor, type TwoFactorState } from '@/app/auth-actions';
import { TextLink } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

/**
 * The second step of signing in: a code from the authenticator app, or a
 * recovery code. `challenge` comes from the first step.
 */
export function TwoFactorForm({
  challenge,
  next = '/',
}: {
  challenge: string;
  next?: string;
}) {
  const [state, action, pending] = useActionState<TwoFactorState, FormData>(
    completeTwoFactor,
    {},
  );
  const id = useId();

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="challenge" value={challenge} />
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-code`}
          className="text-meta font-medium text-ink"
        >
          Code from your authenticator app
        </label>
        <input
          id={`${id}-code`}
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={40}
          aria-invalid={Boolean(state.error) || undefined}
          aria-describedby={`${id}-hint`}
          className={`${fieldClass} font-mono tracking-widest`}
        />
        <p id={`${id}-hint`} className="text-meta-sm text-muted">
          Lost your phone? Enter one of your recovery codes instead.
        </p>
      </div>

      {state.error && (
        <div role="alert" className="rounded-tile bg-alert-soft px-4 py-3">
          <StatusDot
            tone="failure"
            label={state.error}
            className="text-meta text-ink"
          />
          {state.expired && (
            <p className="mt-2 text-meta">
              <TextLink href="/sign-in">Sign in again</TextLink>
            </p>
          )}
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        disabled={pending || state.expired}
        className="mt-1 h-10 w-full"
      >
        {pending ? 'Checking…' : 'Sign in'}
      </Button>
    </form>
  );
}
