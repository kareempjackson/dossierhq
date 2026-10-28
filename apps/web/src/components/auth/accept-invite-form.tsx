'use client';

import { useActionState, useId } from 'react';
import { acceptInvite, type AcceptInviteState } from '@/app/auth-actions';
import { TextLink } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

/** `token` comes from the emailed link; the email is the one invited. */
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
  const invalid = (field: string) => state.field === field || undefined;

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

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-name`}
          className="text-meta font-medium text-ink"
        >
          Your name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          maxLength={100}
          autoComplete="name"
          defaultValue={state.values?.name}
          aria-invalid={invalid('name')}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-title`}
          className="text-meta font-medium text-ink"
        >
          Your role <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={`${id}-title`}
          name="title"
          maxLength={100}
          autoComplete="organization-title"
          placeholder="Technician"
          defaultValue={state.values?.title}
          className={`${fieldClass} placeholder:text-muted`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-password`}
          className="text-meta font-medium text-ink"
        >
          Choose a password
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          aria-invalid={invalid('password')}
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
        {pending ? 'Joining…' : `Join ${workspaceName}`}
      </Button>
    </form>
  );
}
