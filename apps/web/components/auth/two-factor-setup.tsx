'use client';

import { Check, Copy, Download } from 'lucide-react';
import Image from 'next/image';
import { useActionState, useEffect, useId, useState } from 'react';
import { enableTwoFactor, setupTwoFactor } from '@/app/two-factor-actions';
import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import {
  enabled,
  reset,
  saved,
  scanReady,
  selectTwoFactorSetup,
} from '@/lib/store/two-factor-setup-slice';

const APPS = ['1Password', 'Google Authenticator', 'Microsoft Authenticator'];

/**
 * Turning on two-factor sign-in: what it's for, then the QR code and a code
 * from the app, then the recovery codes, shown once. The steps live in the
 * browser's store (two-factor-setup-slice), which forgets the secret and
 * the codes when this leaves the screen. `onSaved` runs once the codes are
 * saved: onboarding finishes there, Settings shows it's on.
 */
export function TwoFactorSetup({
  email,
  onSaved,
  savedLabel = 'Continue',
}: {
  /** Shown in the app as "Dossier (email)". */
  email: string;
  onSaved: () => void;
  savedLabel?: string;
}) {
  const setup = useAppSelector(selectTwoFactorSetup);
  const dispatch = useAppDispatch();

  // Start clean, and forget the secret and codes on the way out.
  useEffect(() => {
    dispatch(reset());
    return () => {
      dispatch(reset());
    };
  }, [dispatch]);

  switch (setup.step) {
    case 'scan':
      return <Scan secret={setup.secret} qr={setup.qr} email={email} />;
    case 'codes':
      return (
        <RecoveryCodes
          codes={setup.recoveryCodes}
          label={savedLabel}
          onSaved={() => {
            dispatch(saved());
            onSaved();
          }}
        />
      );
    case 'done':
      return <Done label="Two-factor sign-in is on" />;
    default:
      return <Intro />;
  }
}

function Intro() {
  const dispatch = useAppDispatch();
  const [state, action, pending] = useActionState<{ error?: string }>(
    async () => {
      const result = await setupTwoFactor();
      if (!result.ok) return { error: result.error };
      dispatch(scanReady({ secret: result.secret, qr: result.qr }));
      return {};
    },
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      <ol className="flex flex-col gap-2">
        <Instruction number={1} title="Have an authenticator app ready">
          Any will do, such as {APPS.slice(0, -1).join(', ')} or {APPS.at(-1)}.
        </Instruction>
        <Instruction number={2} title="Scan a code and type in what it shows">
          It takes about a minute.
        </Instruction>
        <Instruction number={3} title="Keep your recovery codes">
          They sign you in if you lose your phone.
        </Instruction>
      </ol>
      {state.error && (
        <p role="alert" className="text-small text-attention">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        variant="act"
        size="lg"
        disabled={pending}
        className="w-full"
      >
        {pending ? 'Starting…' : 'Set up two-factor sign-in'}
      </Button>
    </form>
  );
}

function Instruction({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5 rounded-xl bg-grey-1 px-4 py-3.5">
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-small font-medium"
      >
        {number}
      </span>
      <span>
        <span className="block text-small font-medium">{title}</span>
        <span className="mt-0.5 block text-small text-muted">{children}</span>
      </span>
    </li>
  );
}

type ScanState = { error?: string; attempt: number };

function Scan({
  secret,
  qr,
  email,
}: {
  secret: string;
  qr: string;
  email: string;
}) {
  const dispatch = useAppDispatch();
  const id = useId();
  const ids = { code: `${id}-code`, error: `${id}-error` };
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState<ScanState, FormData>(
    async (previous, formData) => {
      const result = await enableTwoFactor(String(formData.get('code') ?? ''));
      if (!result.ok) {
        return { error: result.error, attempt: previous.attempt + 1 };
      }
      dispatch(enabled(result.recoveryCodes));
      return { attempt: previous.attempt };
    },
    { attempt: 0 },
  );

  async function copyKey() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <p className="text-small text-muted">
        Add an account in your authenticator app and point it at the code. It
        shows up as Dossier ({email}).
      </p>
      <div className="flex flex-wrap items-start gap-6">
        {/* Always dark on white, which every camera reads. */}
        <Image
          src={qr}
          alt="QR code for your authenticator app"
          width={168}
          height={168}
          unoptimized
          className="rounded-2xl bg-white p-2 ring-1 ring-grey-2"
        />
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
          <p className="text-small text-muted">Can’t scan it? Type this key:</p>
          <code className="font-mono text-small break-all text-ink select-all">
            {secret.match(/.{1,4}/g)?.join(' ')}
          </code>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => void copyKey()}
          >
            <Copy aria-hidden className="size-3.5" strokeWidth={1.75} />
            {copied ? 'Copied' : 'Copy key'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.code} className="text-small font-medium">
          Then enter the 6-digit code it shows
        </label>
        {/* A new attempt starts with empty boxes. */}
        <CodeInput
          key={state.attempt}
          id={ids.code}
          name="code"
          autoFocus
          invalid={Boolean(state.error)}
          describedBy={state.error ? ids.error : undefined}
        />
        {state.error ? (
          <p id={ids.error} role="alert" className="text-small text-attention">
            {state.error}
          </p>
        ) : (
          <p role="status" className="text-small text-muted">
            {pending ? 'Checking…' : 'Codes change every 30 seconds.'}
          </p>
        )}
      </div>

      <Button
        type="submit"
        variant="act"
        size="lg"
        disabled={pending}
        className="w-full"
      >
        {pending ? 'Checking…' : 'Turn on'}
      </Button>
    </form>
  );
}

function RecoveryCodes({
  codes,
  label,
  onSaved,
}: {
  codes: string[];
  label: string;
  onSaved: () => void;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [kept, setKept] = useState(false);
  const text = codes.join('\n');

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          `Dossier recovery codes\n\nEach signs you in once if you can't use your authenticator app.\n\n${text}\n`,
        ],
        { type: 'text/plain' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dossier-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <Done label="Two-factor sign-in is on" />
      <div>
        <p className="font-medium">Save your recovery codes</p>
        <p className="mt-1 text-small text-muted">
          If you lose your phone, each of these signs you in once. Keep them
          somewhere safe, such as your password manager. They won’t be shown
          again.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-2xl bg-grey-1 px-5 py-4 font-mono text-small sm:grid-cols-5">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          <Copy aria-hidden className="size-3.5" strokeWidth={1.75} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" variant="outline" onClick={download}>
          <Download aria-hidden className="size-3.5" strokeWidth={1.75} />
          Download
        </Button>
      </div>

      <label
        htmlFor={`${id}-kept`}
        className="flex cursor-pointer items-start gap-3 rounded-xl bg-grey-1 px-4 py-3.5"
      >
        <input
          id={`${id}-kept`}
          type="checkbox"
          checked={kept}
          onChange={(event) => setKept(event.target.checked)}
          className="mt-0.5 size-4 accent-ink"
        />
        <span className="text-small">
          I’ve saved my recovery codes somewhere safe
        </span>
      </label>

      <Button
        variant="act"
        size="lg"
        disabled={!kept}
        onClick={onSaved}
        className="w-full"
      >
        {label}
      </Button>
    </div>
  );
}

function Done({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-small font-medium text-healthy">
      <span className="grid size-5 place-items-center rounded-full bg-healthy text-white">
        <Check aria-hidden className="size-3" strokeWidth={3} />
      </span>
      {label}
    </p>
  );
}
