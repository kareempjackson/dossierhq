'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useActionState, useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/text-link';
import { MIN_PASSWORD } from '@/lib/passwords';
import { resetPassword, type ResetPasswordState } from '../actions';

/**
 * Choosing a new password from the emailed link (`?token=`). The URL is only
 * known in the browser, so the prerendered page shows the empty form first.
 */
export function ResetPasswordForm() {
  return (
    <Suspense fallback={<ResetPasswordFields />}>
      <WithToken />
    </Suspense>
  );
}

function WithToken() {
  return <ResetPasswordFields token={useSearchParams().get('token') ?? ''} />;
}

function ResetPasswordFields({ token }: { token?: string }) {
  const [state, action, pending] = useActionState<ResetPasswordState, FormData>(
    resetPassword,
    {},
  );
  const id = useId();
  const ids = { password: `${id}-password`, hint: `${id}-hint` };
  const input = useRef<HTMLInputElement>(null);

  // This form replaces the prerendered one once the token is read, so focus
  // it then, unless the person has already moved on to something else.
  useEffect(() => {
    if (token && document.activeElement === document.body)
      input.current?.focus();
  }, [token]);

  if (token === '' || state.expired) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <p
          role="alert"
          className="rounded-xl bg-attention-soft px-4 py-3 text-small text-attention"
        >
          {state.error ??
            'This reset link is incomplete. Open it from the email again.'}
        </p>
        <p className="text-small text-muted">
          Each link works once, for an hour.{' '}
          <TextLink href="/forgot-password">Get a new link</TextLink>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <input type="hidden" name="token" value={token ?? ''} />
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.password} className="text-small font-medium">
          New password
        </label>
        <Input
          id={ids.password}
          name="password"
          type="password"
          ref={input}
          required
          maxLength={200}
          autoComplete="new-password"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={ids.hint}
        />
        {state.error ? (
          <p id={ids.hint} role="alert" className="text-small text-attention">
            {state.error}
          </p>
        ) : (
          <p id={ids.hint} className="text-small text-muted">
            At least {MIN_PASSWORD} characters. A few words together works well.
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
        {pending ? 'Saving…' : 'Save and sign in'}
      </Button>
    </form>
  );
}
