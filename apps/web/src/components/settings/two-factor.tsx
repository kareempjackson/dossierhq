'use client';

import type { TwoFactorStatus } from '@dossierhq/contracts';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent } from 'react';
import {
  disableTwoFactor,
  enableTwoFactor,
  setupTwoFactor,
} from '@/app/two-factor-actions';
import { Button } from '@/components/ui/button';
import { plural } from '@/lib/format';

const fieldClass =
  'h-9 w-40 rounded-input bg-surface px-3 font-mono text-body tracking-widest text-ink';

type Setup = { secret: string; qr: string };

/**
 * Two-factor sign-in for the signed-in person: set it up with a QR code,
 * save the recovery codes once, or turn it off with a current code.
 */
export function TwoFactor({ status }: { status: TwoFactorStatus }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await setupTwoFactor();
      if (result.ok) setSetup({ secret: result.secret, qr: result.qr });
      else setError(result.error);
    });
  }

  if (!status.available) {
    return (
      <p className="text-body text-muted">
        Two-factor sign-in needs CONNECTOR_SECRET_KEY on the API.
      </p>
    );
  }

  if (recoveryCodes) {
    return (
      <RecoveryCodes
        codes={recoveryCodes}
        onDone={() => {
          setRecoveryCodes(null);
          setSetup(null);
          router.refresh();
        }}
      />
    );
  }

  if (setup) {
    return (
      <SetupStep
        setup={setup}
        onEnabled={setRecoveryCodes}
        onCancel={() => setSetup(null)}
      />
    );
  }

  if (status.enabled) {
    return <TurnOff recoveryCodesLeft={status.recoveryCodesLeft} />;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 basis-64 text-body text-text">
        Two-factor sign-in is off. Turn it on to ask for a code from an
        authenticator app, such as 1Password or Google Authenticator, as well as
        your password.
      </p>
      <Button disabled={pending} onClick={start}>
        {pending ? 'Starting…' : 'Set up two-factor'}
      </Button>
      {error && (
        <p role="alert" className="w-full text-meta text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SetupStep({
  setup,
  onEnabled,
  onCancel,
}: {
  setup: Setup;
  onEnabled: (codes: string[]) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await enableTwoFactor(code);
      if (result.ok) onEnabled(result.recoveryCodes);
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text">
        Scan this with your authenticator app, then enter the 6-digit code it
        shows.
      </p>
      <div className="flex flex-wrap items-start gap-5">
        {/* Always dark on white, which every camera reads. */}
        <Image
          src={setup.qr}
          alt="QR code for your authenticator app"
          width={168}
          height={168}
          unoptimized
          className="rounded-tile bg-white p-2"
        />
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-3">
          <p className="text-meta text-muted">Can’t scan it? Enter this key:</p>
          <p className="font-mono text-mono break-all text-ink select-all">
            {setup.secret.match(/.{1,4}/g)?.join(' ')}
          </p>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <label
              htmlFor={`${id}-code`}
              className="text-meta font-medium text-ink"
            >
              Code from the app
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`${id}-code`}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className={fieldClass}
              />
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Checking…' : 'Turn on'}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
          {error && (
            <p role="alert" className="text-meta text-alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-body text-ink">
        Two-factor sign-in is on.
      </p>
      <p className="text-body text-text">
        Save these recovery codes somewhere safe, such as your password manager.
        If you lose your phone, each one signs you in once. They won’t be shown
        again.
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-tile bg-surface px-4 py-3 font-mono text-mono text-ink sm:grid-cols-5">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button variant="primary" onClick={onDone}>
          I’ve saved them
        </Button>
      </div>
    </div>
  );
}

function TurnOff({ recoveryCodesLeft }: { recoveryCodesLeft: number }) {
  const id = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await disableTwoFactor(code);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text">
        Two-factor sign-in is on: signing in asks for a code from your app.{' '}
        {plural(recoveryCodesLeft, 'recovery code')} left
        {recoveryCodesLeft <= 3 &&
          '. To get new ones, turn two-factor off and on again'}
        .
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${id}-code`}
            className="text-meta font-medium text-ink"
          >
            To turn it off, enter a code from your app
          </label>
          <input
            id={`${id}-code`}
            required
            autoComplete="one-time-code"
            maxLength={40}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={fieldClass}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Turning off…' : 'Turn off'}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-meta text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
