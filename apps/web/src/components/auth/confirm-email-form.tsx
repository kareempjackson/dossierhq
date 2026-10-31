'use client';

import { useActionState, useId } from 'react';
import { confirmEmail, type ConfirmEmailState } from '@/app/auth-actions';
import { TextLink } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

/**
 * One click to confirm, never on opening the page: mail scanners open links
 * too. Away from the browser that signed up, the password is asked for.
 */
export function ConfirmEmailForm({
  token,
  sameBrowser,
}: {
  token: string;
  /** This browser signed up, so the password probably isn't needed. */
  sameBrowser: boolean;
}) {
  const [state, action, pending] = useActionState<ConfirmEmailState, FormData>(
    confirmEmail,
    { passwordRequired: !sameBrowser },
  );
  const id = useId();

  if (state.expired || state.taken) {
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
          {state.taken ? (
            <>
              <TextLink href="/sign-in">Sign in</TextLink> with it instead.
            </>
          ) : (
            <>
              Already confirmed? <TextLink href="/sign-in">Sign in</TextLink>.
              Otherwise, <TextLink href="/sign-up">sign up again</TextLink> for
              a new link.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.passwordRequired && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${id}-password`}
            className="text-meta font-medium text-ink"
          >
            Your password
          </label>
          <input
            id={`${id}-password`}
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            aria-invalid={Boolean(state.error) || undefined}
            aria-describedby={`${id}-why`}
            className="h-10 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert"
          />
          <p id={`${id}-why`} className="text-meta-sm text-muted">
            You’re opening the link somewhere other than where you signed up, so
            enter the password you chose.
          </p>
        </div>
      )}

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
        className="h-10 w-full"
      >
        {pending ? 'Confirming…' : 'Confirm and continue'}
      </Button>
    </form>
  );
}
