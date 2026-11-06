'use client';

import { useActionState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/text-link';
import { confirmEmail, type ConfirmEmailState } from '../actions';

/**
 * Confirms the address from the emailed link. In the browser that signed
 * up it's one button; anywhere else the password chosen at sign-up proves
 * it's the same person.
 */
export function ConfirmEmailForm({
  token,
  email,
  sameBrowser,
}: {
  token: string;
  email: string | null;
  sameBrowser: boolean;
}) {
  const [state, action, pending] = useActionState<ConfirmEmailState, FormData>(
    confirmEmail,
    { passwordRequired: !sameBrowser },
  );
  const id = useId();
  const ids = { password: `${id}-password`, error: `${id}-error` };

  if (!token || state.expired) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <p
          role="alert"
          className="rounded-xl bg-attention-soft px-4 py-3 text-small text-attention"
        >
          {state.error ??
            'This link is incomplete. Open it from the email again.'}
        </p>
        <p className="text-small text-muted">
          Each link works once, for 24 hours.{' '}
          <TextLink href="/sign-up">Sign up again</TextLink> to get a new one,
          or <TextLink href="/sign-in">sign in</TextLink> if you’ve already
          confirmed.
        </p>
      </div>
    );
  }

  if (state.taken) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <p
          role="alert"
          className="rounded-xl bg-attention-soft px-4 py-3 text-small text-attention"
        >
          {state.error}
        </p>
        <p className="text-small text-muted">
          <TextLink href="/sign-in">Sign in instead</TextLink>
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mt-2 text-muted">
        {state.passwordRequired ? (
          'Enter the password you chose when you signed up, to show it’s you. It’s only needed when the link opens away from the browser you signed up in.'
        ) : email ? (
          <>
            Confirm{' '}
            <strong className="font-semibold [overflow-wrap:anywhere] text-ink">
              {email}
            </strong>{' '}
            and your account is ready.
          </>
        ) : (
          'Confirm your address and your account is ready.'
        )}
      </p>

      <form action={action} className="mt-8 flex flex-col gap-5">
        <input type="hidden" name="token" value={token} />

        {state.passwordRequired && (
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.password} className="text-small font-medium">
              Password
            </label>
            <Input
              id={ids.password}
              name="password"
              type="password"
              required
              autoFocus
              maxLength={200}
              autoComplete="current-password"
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? ids.error : undefined}
            />
          </div>
        )}

        {state.error && (
          <p id={ids.error} role="alert" className="text-small text-attention">
            {state.error}
          </p>
        )}

        <Button
          type="submit"
          variant="act"
          size="lg"
          disabled={pending}
          className="mt-1 w-full"
        >
          {pending ? 'Confirming…' : 'Confirm and continue'}
        </Button>
      </form>
    </>
  );
}
