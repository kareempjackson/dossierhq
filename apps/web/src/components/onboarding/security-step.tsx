'use client';

import type { TwoFactorStatus } from '@dossierhq/contracts';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import Image from 'next/image';
import { useId, useState, useTransition } from 'react';
import { enableTwoFactor, setupTwoFactor } from '@/app/two-factor-actions';
import { Button } from '@/components/ui/button';
import { CodeInput } from './code-input';
import {
  StepError,
  StepFooter,
  StepHeader,
  type StepProps,
} from './step-parts';

const APPS = [
  '1Password',
  'Google Authenticator',
  'Microsoft Authenticator',
  'Authy',
];

type Phase =
  | { at: 'intro' }
  | { at: 'scan'; secret: string; qr: string }
  | { at: 'codes'; codes: string[] };

/**
 * Two-factor sign-in, which every new account keeps on: get an app, scan
 * the code, prove it works, then keep the recovery codes.
 */
export function SecurityStep({
  next,
  back,
  status,
  email,
  again,
  onEnabled,
}: StepProps & {
  status: TwoFactorStatus;
  email: string;
  /** They turned it off after onboarding, and are setting it up again. */
  again: boolean;
  onEnabled: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ at: 'intro' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!status.available) {
    return (
      <div>
        <StepHeader eyebrow="Security" title="Two-factor sign-in">
          This Dossier server can’t do two-factor sign-in yet: it needs
          CONNECTOR_SECRET_KEY. You can turn it on in Settings once it can.
        </StepHeader>
        <StepFooter back={back}>
          <Button variant="primary" onClick={next}>
            Continue
          </Button>
        </StepFooter>
      </div>
    );
  }

  if (status.enabled && phase.at !== 'codes') {
    return (
      <div>
        <StepHeader eyebrow="Security" title="Two-factor sign-in is on">
          Signing in asks for a code from your authenticator app as well as your
          password.
        </StepHeader>
        <Done label="Your account is protected" />
        <StepFooter back={back}>
          <Button variant="primary" onClick={next}>
            Continue
          </Button>
        </StepFooter>
      </div>
    );
  }

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await setupTwoFactor();
      if (result.ok) setPhase({ at: 'scan', ...result });
      else setError(result.error);
    });
  }

  if (phase.at === 'scan') {
    return (
      <Scan
        secret={phase.secret}
        qr={phase.qr}
        email={email}
        back={() => setPhase({ at: 'intro' })}
        onEnabled={(codes) => {
          onEnabled();
          setPhase({ at: 'codes', codes });
        }}
      />
    );
  }

  if (phase.at === 'codes') {
    return <RecoveryCodes codes={phase.codes} next={next} />;
  }

  return (
    <div>
      <StepHeader
        eyebrow="Security"
        title={
          again ? 'Set up two-factor sign-in again' : 'Protect your account'
        }
      >
        {again
          ? 'Your account keeps two-factor sign-in on. Set it up with your new phone or app to carry on.'
          : 'Dossier holds what your clients’ systems need, so every account signs in with a code from an authenticator app as well as a password.'}
      </StepHeader>

      <ol className="mt-8 flex flex-col gap-3">
        <Instruction icon={Smartphone} title="Have an authenticator app ready">
          Any will do, such as {APPS.slice(0, -1).join(', ')} or {APPS.at(-1)}.
        </Instruction>
        <Instruction
          icon={KeyRound}
          title="Scan a code and type in what it shows"
        >
          It takes about a minute.
        </Instruction>
        <Instruction icon={ShieldCheck} title="Keep your recovery codes">
          They sign you in if you lose your phone.
        </Instruction>
      </ol>

      <div className="mt-6">
        <StepError message={error} />
      </div>

      <StepFooter back={back}>
        <Button variant="primary" disabled={pending} onClick={start}>
          {pending ? 'Starting…' : 'Set up two-factor sign-in'}
        </Button>
      </StepFooter>
    </div>
  );
}

function Instruction({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Smartphone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 rounded-tile bg-surface-soft p-4 ring-1 ring-hairline ring-inset">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sheet text-brand shadow-card">
        <Icon aria-hidden className="size-4" strokeWidth={1.75} />
      </span>
      <span>
        <span className="block text-body font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-meta text-muted">{children}</span>
      </span>
    </li>
  );
}

function Scan({
  secret,
  qr,
  email,
  back,
  onEnabled,
}: {
  secret: string;
  qr: string;
  email: string;
  back: () => void;
  onEnabled: (codes: string[]) => void;
}) {
  const id = useId();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function check(entered: string) {
    setError(null);
    startTransition(async () => {
      const result = await enableTwoFactor(entered);
      if (result.ok) return onEnabled(result.recoveryCodes);
      setError(result.error);
      setCode('');
    });
  }

  async function copyKey() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === 6) check(code);
      }}
    >
      <StepHeader eyebrow="Security" title="Scan this with your app">
        Add an account in your authenticator app and point it at the code. It
        shows up as Dossier ({email}).
      </StepHeader>

      <div className="mt-8 flex flex-wrap items-start gap-8">
        {/* Always dark on white, which every camera reads. */}
        <Image
          src={qr}
          alt="QR code for your authenticator app"
          width={184}
          height={184}
          unoptimized
          className="rounded-tile bg-white p-2 shadow-card ring-1 ring-hairline"
        />
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-6">
          <div>
            <p className="text-meta text-muted">
              Can’t scan it? Type this key:
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="font-mono text-mono break-all text-ink select-all">
                {secret.match(/.{1,4}/g)?.join(' ')}
              </code>
              <Button size="sm" variant="ghost" onClick={() => void copyKey()}>
                <Copy aria-hidden strokeWidth={1.75} />
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`${id}-code`}
              className="text-meta font-medium text-ink"
            >
              Then enter the 6-digit code it shows
            </label>
            <CodeInput
              id={`${id}-code`}
              value={code}
              onChange={setCode}
              onComplete={check}
              disabled={pending}
              invalid={Boolean(error)}
              describedBy={error ? `${id}-error` : undefined}
            />
            <p role="status" className="text-meta-sm text-muted">
              {pending ? 'Checking…' : 'Codes change every 30 seconds.'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <StepError id={`${id}-error`} message={error} />
      </div>

      <StepFooter back={back}>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || code.length < 6}
        >
          {pending ? 'Checking…' : 'Turn on'}
        </Button>
      </StepFooter>
    </form>
  );
}

function RecoveryCodes({ codes, next }: { codes: string[]; next: () => void }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
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
    <div>
      <Done label="Two-factor sign-in is on" />
      <StepHeader eyebrow="Security" title="Save your recovery codes">
        If you lose your phone, each of these signs you in once. Keep them
        somewhere safe, such as your password manager. They won’t be shown
        again.
      </StepHeader>

      <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 rounded-tile bg-surface px-5 py-4 font-mono text-mono text-ink sm:grid-cols-5">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copy()}>
          <Copy aria-hidden strokeWidth={1.75} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" onClick={download}>
          <Download aria-hidden strokeWidth={1.75} />
          Download
        </Button>
      </div>

      <label
        htmlFor={`${id}-saved`}
        className="mt-6 flex cursor-pointer items-start gap-3 rounded-tile bg-surface-soft p-4 ring-1 ring-hairline ring-inset"
      >
        <input
          id={`${id}-saved`}
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="mt-0.5 size-4 accent-brand"
        />
        <span className="text-body text-ink">
          I’ve saved my recovery codes somewhere safe
        </span>
      </label>

      <StepFooter>
        <Button variant="primary" disabled={!saved} onClick={next}>
          Continue
        </Button>
      </StepFooter>
    </div>
  );
}

function Done({ label }: { label: string }) {
  return (
    <p className="mb-6 flex items-center gap-2 text-body font-medium text-brand">
      <span className="grid size-6 place-items-center rounded-full bg-brand text-white motion-safe:animate-pop">
        <Check aria-hidden className="size-3.5" strokeWidth={3} />
      </span>
      {label}
    </p>
  );
}
