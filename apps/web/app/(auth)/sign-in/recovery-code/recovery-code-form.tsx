'use client';

import { useActionState, useId } from 'react';
import { NextField, TextLinkKeepingNext } from '@/components/auth/next-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/text-link';
import { completeTwoFactor, type TwoFactorState } from '../../actions';

/**
 * Signing in with a recovery code instead of the app. Codes look like
 * `k7m2q-x9p4a`; the API ignores case, spaces and dashes, so any way of
 * typing one works.
 */
export function RecoveryCodeForm() {
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
          <label htmlFor={ids.code} className="text-small font-medium">
            Recovery code
          </label>
          <Input
            id={ids.code}
            name="code"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            defaultValue={state.code}
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
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-small text-muted">
        Have your phone?{' '}
        <TextLinkKeepingNext href="/sign-in/two-factor">
          Use your authenticator
        </TextLinkKeepingNext>
      </p>
    </>
  );
}
