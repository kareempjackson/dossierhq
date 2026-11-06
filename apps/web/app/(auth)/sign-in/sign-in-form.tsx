'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useActionState, useId } from 'react';
import { NextField } from '@/components/auth/next-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/text-link';
import { signIn, type SignInState } from '../actions';

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    {},
  );
  const id = useId();
  const ids = {
    email: `${id}-email`,
    password: `${id}-password`,
    error: `${id}-error`,
  };
  const invalid = state.error ? true : undefined;
  const describedBy = state.error ? ids.error : undefined;

  return (
    <>
      {/* The URL is only known in the browser, so this renders there. */}
      <Suspense fallback={null}>
        <ExpiredNotice hidden={Boolean(state.error)} />
      </Suspense>

      <form action={action} className="mt-8 flex flex-col gap-5">
        <NextField />

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.email} className="text-small font-medium">
            Work email
          </label>
          <Input
            id={ids.email}
            name="email"
            type="email"
            required
            autoComplete="username"
            spellCheck={false}
            defaultValue={state.email}
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.password} className="text-small font-medium">
            Password
          </label>
          <div className="relative">
            <Input
              id={ids.password}
              name="password"
              type="password"
              required
              autoComplete="current-password"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className="pr-20"
            />
            <TextLink
              href="/forgot-password"
              className="absolute top-1/2 right-4 -translate-y-1/2 text-small"
            >
              Forgot?
            </TextLink>
          </div>
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
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </>
  );
}

/** Says why they're here when the last session ended (`?expired=1`). */
function ExpiredNotice({ hidden }: { hidden: boolean }) {
  const expired = useSearchParams().get('expired') === '1';
  if (!expired || hidden) return null;
  return (
    <p
      role="status"
      className="mt-6 rounded-xl bg-grey-1 px-4 py-3 text-small text-muted"
    >
      Your session ended. Sign in again to carry on.
    </p>
  );
}
