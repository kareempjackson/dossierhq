'use client';

import { useActionState, useId } from 'react';
import { acceptInvite, type AcceptInviteState } from '@/app/auth-actions';
import { TextLink } from '@/components/auth/auth-card';
import { NewPasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

/**
 * `token` comes from the emailed link; the email is the one invited. Only a
 * password here: onboarding asks for the rest.
 */
export function AcceptInviteForm({
  token,
  email,
  workspaceName,
}: {
  token: string;
  email: string;
  workspaceName: string;
}) {
  const [state, action, pending] = useActionState<AcceptInviteState, FormData>(
    acceptInvite,
    {},
  );
  const id = useId();

  if (state.expired || state.taken) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <div role="alert" className="rounded-tile bg-alert-soft px-4 py-3">
          <StatusDot
            tone="failure"
            label={state.error ?? 'This invite can’t be used.'}
            className="text-meta text-ink"
          />
        </div>
        <p className="text-meta text-text">
          {state.taken ? (
            <TextLink href="/sign-in">Sign in instead</TextLink>
          ) : (
            'Ask whoever invited you to send a new one.'
          )}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <span className="text-meta font-medium text-ink">Email</span>
        <p className="text-body text-text">{email}</p>
        <input
          type="hidden"
          name="username"
          autoComplete="username"
          value={email}
        />
      </div>

      <NewPasswordField
        id={`${id}-password`}
        label="Choose a password"
        invalid={Boolean(state.error)}
        autoFocus
      />

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
        {pending ? 'Joining…' : `Join ${workspaceName}`}
      </Button>
      <p className="text-center text-meta-sm text-muted">
        Next, you’ll add your name and set up two-factor sign-in.
      </p>
    </form>
  );
}
