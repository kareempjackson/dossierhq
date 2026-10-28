'use client';

import { useActionState, useId } from 'react';
import {
  requestPasswordReset,
  type ResetRequestState,
} from '@/app/auth-actions';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(
    requestPasswordReset,
    {},
  );
  const id = useId();

  if (state.sent) {
    return (
      <p
        role="status"
        className="mt-6 rounded-tile bg-surface px-4 py-3 text-meta text-text"
      >
        If an account uses <span className="text-ink">{state.email}</span>, it
        has an email with a link to choose a new password. The link works for an
        hour. Nothing there? Check spam, or ask again in a minute.
      </p>
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-email`}
          className="text-meta font-medium text-ink"
        >
          Email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="username"
          spellCheck={false}
          defaultValue={state.email}
          aria-invalid={Boolean(state.error) || undefined}
          className={fieldClass}
        />
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
        {pending ? 'Sending…' : 'Email me a link'}
      </Button>
    </form>
  );
}
