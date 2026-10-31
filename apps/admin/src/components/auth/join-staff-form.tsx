'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import {
  acceptInvite,
  setupInvite,
  type AcceptState,
  type InviteSetupResult,
} from '@/app/auth-actions';
import { Button, ButtonLink } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { LoadingLabel, Skeleton } from '@/components/ui/states';

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body text-ink aria-invalid:outline-2 aria-invalid:outline-alert';

/**
 * Joining from an invite: a name and password, the authenticator app (QR
 * code, then its first code), and finally the recovery codes, shown once.
 */
export function JoinStaffForm({ token }: { token: string }) {
  const [setup, setSetup] = useState<InviteSetupResult | null>(null);
  const [state, action, pending] = useActionState<AcceptState, FormData>(
    acceptInvite,
    {},
  );
  const id = useId();

  useEffect(() => {
    let current = true;
    void setupInvite(token).then((result) => {
      if (current) setSetup(result);
    });
    return () => {
      current = false;
    };
  }, [token]);

  if (state.recoveryCodes) {
    return <RecoveryCodes codes={state.recoveryCodes} />;
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input
        type="hidden"
        name="sealed"
        value={setup?.ok ? setup.sealed : ''}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-name`}
          className="text-meta font-medium text-ink"
        >
          Your name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          autoComplete="name"
          maxLength={100}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-password`}
          className="text-meta font-medium text-ink"
        >
          Password
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          aria-describedby={`${id}-password-hint`}
          className={fieldClass}
        />
        <p id={`${id}-password-hint`} className="text-meta-sm text-muted">
          At least 12 characters.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-tile bg-surface p-4">
        <legend className="sr-only">Authenticator app</legend>
        <p className="text-meta font-medium text-ink">
          Add Dossier Admin to your authenticator app
        </p>
        {setup === null ? (
          <div className="flex items-center gap-4">
            <Skeleton className="size-36 shrink-0" />
            <LoadingLabel what="QR code" />
          </div>
        ) : setup.ok ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URI */}
            <img
              src={setup.qr}
              alt="QR code to add Dossier Admin to an authenticator app"
              width={144}
              height={144}
              className="size-36 shrink-0 rounded-row bg-white"
            />
            <p className="text-meta text-text">
              Scan the code with 1Password, Google Authenticator or a similar
              app. Can’t scan? Enter this key instead:{' '}
              <code className="font-mono break-all text-ink">
                {setup.secret}
              </code>
            </p>
          </div>
        ) : (
          <StatusDot
            tone="failure"
            label={setup.error}
            className="text-meta text-ink"
          />
        )}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${id}-code`}
            className="text-meta font-medium text-ink"
          >
            The 6-digit code it shows
          </label>
          <input
            id={`${id}-code`}
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            className={`${fieldClass} bg-sheet font-mono tracking-widest`}
          />
        </div>
      </fieldset>

      {state.error && (
        <div role="alert" className="rounded-tile bg-alert-soft px-4 py-3">
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
        disabled={pending || !setup?.ok}
        className="mt-1 h-10 w-full"
      >
        {pending ? 'Joining…' : 'Join the staff'}
      </Button>
    </form>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <p role="status" className="text-text">
        You’re in. Keep these recovery codes somewhere safe: each one signs you
        in once if you lose your phone, and they won’t be shown again.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-tile bg-surface p-4 font-mono text-mono text-ink">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <ButtonLink href="/" variant="primary" className="h-10 w-full">
        I’ve saved them, continue
      </ButtonLink>
    </div>
  );
}
