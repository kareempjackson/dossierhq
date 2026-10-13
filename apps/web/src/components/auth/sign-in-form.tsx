'use client';

import { useActionState, useId, useRef } from 'react';
import { signIn, type SignInState } from '@/app/auth-actions';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

type SignInFormProps = {
  /** Where to go once signed in, already checked to be on this site. */
  next: string;
  /** The last session ended, so say why they're here. */
  expired: boolean;
  /** Shown when the deployment has a demo account configured. */
  demo: { email: string; password: string } | null;
};

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

export function SignInForm({ next, expired, demo }: SignInFormProps) {
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
  const form = useRef<HTMLFormElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  function fillDemoAccount() {
    if (!demo || !email.current || !password.current) return;
    email.current.value = demo.email;
    password.current.value = demo.password;
    form.current?.requestSubmit();
  }

  const invalid = Boolean(state.error) || undefined;

  return (
    <>
      {expired && !state.error && (
        <p
          role="status"
          className="mt-6 rounded-tile bg-surface px-4 py-3 text-meta text-text"
        >
          Your session ended. Sign in again to carry on.
        </p>
      )}

      <form ref={form} action={action} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.email} className="text-meta font-medium text-ink">
            Email
          </label>
          <input
            ref={email}
            id={ids.email}
            name="email"
            type="email"
            required
            autoComplete="username"
            spellCheck={false}
            defaultValue={state.email}
            aria-invalid={invalid}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={ids.password}
            className="text-meta font-medium text-ink"
          >
            Password
          </label>
          <input
            ref={password}
            id={ids.password}
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={invalid}
            className={fieldClass}
          />
        </div>

        {state.error && (
          <div
            id={ids.error}
            role="alert"
            className="rounded-tile bg-alert-soft px-4 py-3"
          >
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
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {demo && (
        <section
          aria-labelledby={`${id}-demo`}
          className="mt-6 rounded-tile bg-surface-soft p-4"
        >
          <h2 id={`${id}-demo`} className="text-meta font-medium">
            Demo account
          </h2>
          <p className="mt-1 text-meta text-muted">
            A sample workspace with fictional clients.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-meta">
            <dt className="text-muted">Email</dt>
            <dd className="truncate font-mono text-mono text-ink">
              {demo.email}
            </dd>
            <dt className="text-muted">Password</dt>
            <dd className="truncate font-mono text-mono text-ink">
              {demo.password}
            </dd>
          </dl>
          <Button
            disabled={pending}
            onClick={fillDemoAccount}
            className="mt-4 w-full"
          >
            Use demo account
          </Button>
        </section>
      )}
    </>
  );
}
