'use client';

import type { TwoFactorStatus } from '@dossierhq/contracts';
import { useRouter } from 'next/navigation';
import { useActionState, useId, useState } from 'react';
import { disableTwoFactor } from '@/app/two-factor-actions';
import {
  emailPasswordLink,
  signOutEverywhereElse,
  type PasswordLinkState,
  type SignOutOthersState,
} from '@/app/(workspace)/settings/actions';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { useAppSelector } from '@/lib/store/hooks';
import { selectMe } from '@/lib/store/session-slice';

/** This browser's session, worded on the server in the workspace's time zone. */
export type BrowserSession = {
  /** e.g. "3 November" */
  since: string;
  /** e.g. "3 December" */
  latest: string;
  /** e.g. "3 days" */
  idle: string;
  /** How many other browsers and devices are signed in. */
  others: number;
};

const ROLES = { owner: 'Owner', admin: 'Admin', technician: 'Technician' };

/**
 * Who you are, how you sign in, and this browser's session. Who you are
 * comes from the browser's store; two-factor and the session come from the
 * API with the page.
 */
export function AccountSection({
  twoFactor,
  session,
}: {
  twoFactor: TwoFactorStatus | null;
  session: BrowserSession | null;
}) {
  const me = useAppSelector(selectMe);
  const initials = me?.user.name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  return (
    <div className="flex flex-col gap-5">
      <section
        id="account"
        aria-label="Your account"
        className="scroll-mt-6 rounded-3xl bg-grey-1 p-5 sm:p-6"
      >
        {me ? (
          <div className="flex animate-enter items-center gap-4">
            <span
              aria-hidden
              className="grid size-16 shrink-0 place-items-center rounded-full bg-lilac-soft font-display text-h3 text-lilac-ink"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <h2 className="text-h2 [overflow-wrap:anywhere]">
                {me.user.name}
              </h2>
              <p className="text-small text-muted [overflow-wrap:anywhere]">
                {[me.user.email, me.user.title].filter(Boolean).join(' · ')}
              </p>
              <Tag tone="drafted" className="mt-1.5">
                {ROLES[me.role]}
              </Tag>
            </div>
          </div>
        ) : (
          <IdentityPending />
        )}

        <TwoFactorRow status={twoFactor} email={me?.user.email ?? ''} />
        <PasswordRow />
      </section>

      <section
        aria-labelledby="this-browser"
        className="rounded-3xl bg-grey-1 p-5 sm:p-6"
      >
        <p id="this-browser" className="text-[0.75rem] text-muted">
          This browser
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          {session ? (
            <div>
              <p className="flex flex-wrap items-center gap-2 text-small">
                <Tag tone="healthy">Active now</Tag>
                <span className="font-medium">
                  Signed in since {session.since}
                </span>
              </p>
              <p className="mt-2 text-[0.75rem] text-muted">
                Dossier signs you out after {session.idle} without using it, and
                on {session.latest} at the latest.
              </p>
            </div>
          ) : (
            <p className="text-small text-muted">
              Couldn’t load this session’s details.
            </p>
          )}
          <SignOutButton />
        </div>
        {session && session.others > 0 && (
          <OtherSessions count={session.others} />
        )}
      </section>
    </div>
  );
}

/** Room for who you are, until the browser's store knows. It's brief. */
function IdentityPending() {
  return <div aria-hidden className="h-16" />;
}

/** Off: set it up here. On: turn it off with a code. */
function TwoFactorRow({
  status,
  email,
}: {
  status: TwoFactorStatus | null;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  let description: string;
  if (!status) description = 'Couldn’t load your two-factor sign-in.';
  else if (!status.available)
    description = 'This Dossier server can’t do two-factor sign-in yet.';
  else if (status.enabled)
    description = `On. Signing in asks for a code from your app. ${status.recoveryCodesLeft} recovery ${status.recoveryCodesLeft === 1 ? 'code' : 'codes'} left.`;
  else
    description =
      'Off. Ask for a code from an authenticator app, such as 1Password or Google Authenticator, as well as your password.';

  const canChange = Boolean(status?.available);

  return (
    <div className="mt-5 rounded-xl bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-small font-medium">Two-factor sign-in</p>
          <p className="text-[0.75rem] text-muted">{description}</p>
        </div>
        {canChange && !open && (
          <Button
            variant={status?.enabled ? 'outline' : 'act'}
            size="sm"
            onClick={() => setOpen(true)}
          >
            {status?.enabled ? 'Turn off' : 'Set up'}
          </Button>
        )}
      </div>
      {open && status && (
        <div className="mt-4 border-t border-grey-1 pt-4">
          {status.enabled ? (
            <TurnOff
              required={status.required}
              onClose={() => setOpen(false)}
            />
          ) : (
            <TwoFactorSetup
              email={email}
              savedLabel="Done"
              onSaved={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Closes once it's off, so the row says so rather than starting setup. */
function TurnOff({
  required,
  onClose,
}: {
  required: boolean;
  onClose: () => void;
}) {
  const id = useId();
  const [state, action, pending] = useActionState<{ error?: string }, FormData>(
    async (_previous, formData) => {
      const result = await disableTwoFactor(String(formData.get('code') ?? ''));
      if (!result.ok) return { error: result.error };
      onClose();
      return {};
    },
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      {required && (
        <p className="rounded-lg bg-lime-soft px-3 py-2 text-[0.75rem]">
          Your account keeps two-factor sign-in on. Turning it off takes you
          straight to setting it up again, for example on a new phone.
        </p>
      )}
      <label htmlFor={`${id}-code`} className="text-small font-medium">
        A code from your app, or a recovery code
      </label>
      <Input
        id={`${id}-code`}
        name="code"
        required
        autoFocus
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={40}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? `${id}-error` : undefined}
      />
      {state.error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-small text-attention"
        >
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="ink" size="sm" disabled={pending}>
          {pending ? 'Turning off…' : 'Turn off'}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The API can't change a password in place: it emails a link instead. */
function PasswordRow() {
  const [state, action, pending] = useActionState<PasswordLinkState>(
    emailPasswordLink,
    {},
  );
  return (
    <form
      action={action}
      className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white px-4 py-3.5"
    >
      <div>
        <p className="text-small font-medium">Password</p>
        <p role="status" className="text-[0.75rem] text-muted">
          {state.sentTo
            ? `Sent to ${state.sentTo}. The link works for an hour.`
            : 'Get a link by email to choose a new one. Saving it signs you out everywhere else.'}
        </p>
        {state.error && (
          <p role="alert" className="mt-1 text-[0.75rem] text-attention">
            {state.error}
          </p>
        )}
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Sending…' : state.sentTo ? 'Send again' : 'Email me a link'}
      </Button>
    </form>
  );
}

function OtherSessions({ count }: { count: number }) {
  const [state, action, pending] = useActionState<SignOutOthersState>(
    signOutEverywhereElse,
    {},
  );
  return (
    <form
      action={action}
      className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-grey-2 pt-4"
    >
      <p className="text-small text-muted">
        Also signed in on {count} other{' '}
        {count === 1 ? 'browser or device' : 'browsers or devices'}.
        {state.error && (
          <span role="alert" className="block text-attention">
            {state.error}
          </span>
        )}
      </p>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out everywhere else'}
      </Button>
    </form>
  );
}
