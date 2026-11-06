'use client';

import { useActionState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/text-link';
import { MIN_PASSWORD } from '@/lib/passwords';
import { acceptInvite, type AcceptInviteState } from '../actions';

/** The invited email is fixed; only the password is chosen here. */
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
  const ids = {
    email: `${id}-email`,
    password: `${id}-password`,
    hint: `${id}-hint`,
  };

  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.email} className="text-small font-medium">
          Work email
        </label>
        {/* Read-only: the invite is for this address. Named for password managers. */}
        <Input
          id={ids.email}
          name="username"
          autoComplete="username"
          value={email}
          readOnly
        />
      </div>

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
          autoComplete="new-password"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={ids.hint}
        />
        {state.error ? (
          <p id={ids.hint} role="alert" className="text-small text-attention">
            {state.error}
            {state.taken && (
              <>
                {' '}
                <TextLink href="/sign-in">Sign in instead</TextLink>
              </>
            )}
          </p>
        ) : (
          <p id={ids.hint} className="text-small text-muted">
            At least {MIN_PASSWORD} characters
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
        {pending ? 'Joining…' : `Join ${workspaceName}`}
      </Button>
    </form>
  );
}
