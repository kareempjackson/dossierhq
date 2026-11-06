'use client';

import { useActionState, useId } from 'react';
import { NextField, TextLinkKeepingNext } from '@/components/auth/next-field';
import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { TextLink } from '@/components/ui/text-link';
import { completeTwoFactor, type TwoFactorState } from '../../actions';

/** The second step of signing in: the 6-digit code from the app. */
export function TwoFactorForm() {
  const [state, action, pending] = useActionState<TwoFactorState, FormData>(
    completeTwoFactor,
    {},
  );
  const id = useId();
  const ids = { code: `${id}-code`, error: `${id}-error` };

  return (
    <>
      <form action={action} className="mt-8 flex flex-col gap-5">
        <NextField />

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.code} className="sr-only">
            6-digit code
          </label>
          {/* A new attempt starts with empty boxes. */}
          <CodeInput
            key={state.attempt ?? 0}
            id={ids.code}
            name="code"
            autoFocus
            invalid={Boolean(state.error)}
            describedBy={state.error ? ids.error : undefined}
          />
          {state.error && (
            <p
              id={ids.error}
              role="alert"
              className="text-small text-attention"
            >
              {state.error}
              {state.expired && (
                <>
                  {' '}
                  <TextLink href="/sign-in">Sign in again</TextLink>
                </>
              )}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="act"
          size="lg"
          disabled={pending || state.expired}
          className="mt-1 w-full"
        >
          {pending ? 'Checking…' : 'Continue'}
        </Button>
      </form>

      <p className="mt-6 text-small text-muted">
        Lost your phone?{' '}
        <TextLinkKeepingNext href="/sign-in/recovery-code">
          Use a recovery code
        </TextLinkKeepingNext>
      </p>
    </>
  );
}
