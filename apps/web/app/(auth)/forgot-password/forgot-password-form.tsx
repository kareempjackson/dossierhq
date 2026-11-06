'use client';

import { useActionState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { requestPasswordReset, type ResetRequestState } from '../actions';

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(
    requestPasswordReset,
    {},
  );
  const id = useId();
  const ids = {
    form: `${id}-form`,
    email: `${id}-email`,
    error: `${id}-error`,
  };

  return (
    <>
      <form id={ids.form} action={action} className="mt-8 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.email} className="text-small font-medium">
            Work email
          </label>
          <Input
            id={ids.email}
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            spellCheck={false}
            defaultValue={state.email}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? ids.error : undefined}
          />
          {state.error && (
            <p
              id={ids.error}
              role="alert"
              className="text-small text-attention"
            >
              {state.error}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="act"
          size="lg"
          disabled={pending}
          className="mt-1 w-full"
        >
          {pending ? 'Sending…' : 'Email me a link'}
        </Button>
      </form>

      {state.sent && state.email && (
        <div role="status" className="mt-6 rounded-2xl bg-grey-1 p-5">
          <p className="flex items-center gap-3">
            <Tag tone="healthy">Sent</Tag>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Check {state.email}
            </span>
          </p>
          <p className="mt-2 text-small text-muted">
            The link works for 1 hour. Didn’t get it? Check spam, or{' '}
            <button
              type="submit"
              form={ids.form}
              disabled={pending}
              className="rounded-sm text-ink underline decoration-ink/30 underline-offset-[3px] transition-colors hover:decoration-ink"
            >
              send it again
            </button>
            .
          </p>
        </div>
      )}
    </>
  );
}
