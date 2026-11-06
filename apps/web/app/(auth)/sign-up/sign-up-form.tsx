'use client';

import { useSearchParams } from 'next/navigation';
import { useActionState, useId, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MIN_PASSWORD } from '@/lib/passwords';
import { signUp, type SignUpState } from '../actions';

const noSubscription = () => () => {};

/**
 * Email and password only: the rest comes in setting up, once the email is
 * confirmed. The browser's time zone goes along for the new workspace.
 */
/** The form, starting from the address in the URL (`?email=`). Put it in Suspense. */
export function SignUpFormFromUrl() {
  const email = useSearchParams().get('email') ?? '';
  return <SignUpForm key={email} initialEmail={email} />;
}

export function SignUpForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [state, action, pending] = useActionState<SignUpState, FormData>(
    signUp,
    {},
  );
  const id = useId();
  const ids = {
    email: `${id}-email`,
    password: `${id}-password`,
    emailError: `${id}-email-error`,
    passwordHint: `${id}-password-hint`,
    formError: `${id}-form-error`,
  };
  // Unknown while prerendering; the API falls back to UTC.
  const timeZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => '',
  );
  const emailError = state.field === 'email' ? state.error : undefined;
  const passwordError = state.field === 'password' ? state.error : undefined;
  const formError = state.error && !state.field ? state.error : undefined;

  return (
    <form action={action} className="mt-8 flex flex-col gap-5">
      <input type="hidden" name="timeZone" value={timeZone} />

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
          placeholder="you@yourmsp.com"
          defaultValue={state.email ?? initialEmail}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? ids.emailError : undefined}
        />
        {emailError && (
          <p
            id={ids.emailError}
            role="alert"
            className="text-small text-attention"
          >
            {emailError}
          </p>
        )}
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
          maxLength={200}
          autoComplete="new-password"
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={ids.passwordHint}
        />
        {passwordError ? (
          <p
            id={ids.passwordHint}
            role="alert"
            className="text-small text-attention"
          >
            {passwordError}
          </p>
        ) : (
          <p id={ids.passwordHint} className="text-small text-muted">
            At least {MIN_PASSWORD} characters
          </p>
        )}
      </div>

      {formError && (
        <p
          id={ids.formError}
          role="alert"
          className="text-small text-attention"
        >
          {formError}
        </p>
      )}

      <div className="mt-1 flex flex-col gap-4">
        <Button
          type="submit"
          variant="act"
          size="lg"
          disabled={pending}
          className="w-full"
        >
          {pending ? 'Sending your link…' : 'Create account'}
        </Button>
        <p className="text-small text-muted">
          We’ll email you a link to confirm it’s your address.
        </p>
      </div>
    </form>
  );
}
