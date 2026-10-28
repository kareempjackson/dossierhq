'use client';

import { useActionState, useId } from 'react';
import { resetPassword, type ResetPasswordState } from '@/app/auth-actions';
import { TextLink } from '@/components/auth/auth-card';
import { TwoFactorForm } from '@/components/auth/two-factor-form';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

/** `token` comes from the emailed link. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    resetPassword,
    token ? {} : { error: 'This reset link is incomplete.', expired: true },
  );
  const id = useId();

  if (state.challenge) {
    return (
      <>
        <p
          role="status"
          className="mt-6 rounded-tile bg-surface px-4 py-3 text-meta text-text"
        >
          Your new password is saved. Two-factor sign-in is on, so enter a code
          to finish.
        </p>
        <TwoFactorForm challenge={state.challenge} />
      </>
    );
  }

  if (state.expired) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <div role="alert" className="rounded-tile bg-alert-soft px-4 py-3">
          <StatusDot
            tone="failure"
            label={state.error ?? 'This link can’t be used.'}
            className="text-meta text-ink"
          />
        </div>
        <p className="text-meta text-text">
          Each link works once, for an hour.{' '}
          <TextLink href="/forgot-password">Get a new link</TextLink>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-password`}
          className="text-meta font-medium text-ink"
        >
          New password
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          aria-invalid={Boolean(state.error) || undefined}
          aria-describedby={`${id}-hint`}
          className={fieldClass}
        />
        <p id={`${id}-hint`} className="text-meta-sm text-muted">
          At least 12 characters. A few words together works well.
        </p>
      </div>

      {state.error && (
        <div role="alert" className="rounded-tile bg-alert-soft px-4 py-3">
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
        {pending ? 'Saving…' : 'Save and sign in'}
      </Button>
    </form>
  );
}
