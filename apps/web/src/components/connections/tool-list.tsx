'use client';

import type { Tool } from '@dossierhq/contracts';
import { useRouter } from 'next/navigation';
import {
  useActionState,
  useEffect,
  useId,
  useState,
  useTransition,
} from 'react';
import {
  connectTool,
  disconnectTool,
  forgetSignInProblem,
  syncTool,
  type ConnectState,
} from '@/app/connection-actions';
import { Button } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';
import { TOOL_GUIDES, type GuideField } from '@/lib/tool-guides';

export type ToolEntry = {
  tool: Tool;
  name: string;
  connector: {
    account: string;
    scope: string;
    access: string;
    status: { tone: StatusTone; label: string };
    syncing: boolean;
    failure: { summary: string; fix: string; detail: string } | null;
    details: { label: string; value: string }[];
  } | null;
};

type Open = { tool: Tool; mode: 'form' | 'manage' | 'disconnect' } | null;

/** For tools you sign in to on their own page, like NinjaOne. */
export type SignIn = {
  /** What to register as the app's redirect URI. */
  redirectUri: string;
  /** Why the last sign-in didn't work, shown once. */
  problem: string | null;
};

/**
 * Every tool Dossier can read, connected or not. One form or panel is open
 * at a time, so there is only ever one green button on the screen.
 */
export function ToolList({
  tools,
  canManage,
  signIn,
}: {
  tools: ToolEntry[];
  canManage: boolean;
  signIn: SignIn;
}) {
  // A failed sign-in reopens its form to say why; the page forgets it after.
  const [problem] = useState(signIn.problem);
  const [open, setOpen] = useState<Open>(
    problem ? { tool: 'ninjaone', mode: 'form' } : null,
  );
  const router = useRouter();
  const syncing = tools.some((t) => t.connector?.syncing);

  useEffect(() => {
    if (problem) void forgetSignInProblem();
  }, [problem]);

  // While a sync runs, look again every few seconds.
  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(timer);
  }, [syncing, router]);

  const toggle = (tool: Tool, mode: NonNullable<Open>['mode']) =>
    setOpen((current) =>
      current?.tool === tool && current.mode === mode ? null : { tool, mode },
    );
  const failing = tools.filter((t) => t.connector?.failure);

  return (
    <>
      {failing.map((entry, index) => (
        <FailureNotice
          key={entry.tool}
          entry={entry}
          primary={index === 0 && open?.mode !== 'form'}
          canManage={canManage}
          onFix={() => {
            setOpen({ tool: entry.tool, mode: 'form' });
            document
              .getElementById(`tool-${entry.tool}`)
              ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          }}
        />
      ))}

      <section aria-labelledby="tools-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2
            id="tools-heading"
            className="text-section font-semibold text-ink"
          >
            Tools
          </h2>
          <p className="text-meta text-muted">
            {canManage
              ? 'Read only. Credentials are encrypted and never shown again.'
              : 'Only the workspace owner can connect or disconnect tools.'}
          </p>
        </div>
        <ul className="mt-3 divide-y divide-hairline rounded-card bg-sheet shadow-card">
          {tools.map((entry) => (
            <ToolRow
              key={entry.tool}
              entry={entry}
              open={open?.tool === entry.tool ? open.mode : null}
              canManage={canManage}
              signIn={{ redirectUri: signIn.redirectUri, problem }}
              onToggle={(mode) => toggle(entry.tool, mode)}
              onClose={() => setOpen(null)}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

function ToolRow({
  entry,
  open,
  canManage,
  signIn,
  onToggle,
  onClose,
}: {
  entry: ToolEntry;
  open: NonNullable<Open>['mode'] | null;
  canManage: boolean;
  signIn: SignIn;
  onToggle: (mode: NonNullable<Open>['mode']) => void;
  onClose: () => void;
}) {
  const { tool, name, connector } = entry;
  const panelId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? 'Something went wrong.');
      else onClose();
    });
  }

  return (
    <li id={`tool-${tool}`} className="scroll-mt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4">
        <ConnectorTile tool={tool} />
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-medium text-ink">{name}</p>
          {connector ? (
            <>
              <p className="text-meta text-muted">{connector.scope}</p>
              <p className="mt-0.5 font-mono text-mono break-words text-muted">
                {connector.account}
              </p>
            </>
          ) : (
            <p className="text-meta text-muted">{TOOL_GUIDES[tool].reads}</p>
          )}
        </div>
        {connector ? (
          <>
            <StatusDot
              tone={connector.status.tone}
              label={connector.status.label}
              className={cn(
                'text-meta',
                connector.status.tone === 'failure' ? 'text-ink' : 'text-text',
              )}
            />
            <Button
              aria-expanded={open === 'manage'}
              aria-controls={panelId}
              onClick={() => onToggle('manage')}
            >
              Manage<span className="sr-only"> {name}</span>
            </Button>
          </>
        ) : (
          canManage && (
            <Button
              aria-expanded={open === 'form'}
              aria-controls={panelId}
              onClick={() => onToggle('form')}
            >
              {open === 'form' ? 'Close' : 'Connect'}
              <span className="sr-only">
                {open === 'form' ? ` the ${name} form` : ` ${name}`}
              </span>
            </Button>
          )
        )}
      </div>

      <div id={panelId} hidden={!open} className="mx-4 mb-4">
        {open === 'manage' && connector && (
          <div className="rounded-tile bg-surface-soft p-4">
            <dl className="grid gap-x-6 gap-y-2 text-meta sm:grid-cols-[auto_1fr]">
              {connector.details.map((detail) => (
                <div key={detail.label} className="contents">
                  <dt className="text-muted">{detail.label}</dt>
                  <dd className="text-ink">{detail.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={pending || connector.syncing}
                onClick={() => run(() => syncTool(tool))}
              >
                {connector.syncing ? 'Syncing…' : 'Sync now'}
              </Button>
              {canManage && (
                <>
                  <Button onClick={() => onToggle('form')}>
                    Update credentials
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onToggle('disconnect')}
                  >
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {open === 'disconnect' && connector && (
          <div className="rounded-tile bg-surface-soft p-4">
            <p className="font-medium text-ink">Disconnect {name}?</p>
            <p className="mt-1 text-meta text-text">
              Dossier forgets the credentials and everything it read from {name}
              . Clients that only {name} knows about are removed. You can
              connect it again at any time.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={pending}
                onClick={() => run(() => disconnectTool(tool))}
              >
                {pending ? 'Disconnecting…' : `Disconnect ${name}`}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {open === 'form' && (
          <ConnectForm
            tool={tool}
            name={name}
            connected={connector !== null}
            signIn={signIn}
            onDone={onClose}
          />
        )}

        {error && (
          <p role="alert" className="mt-3">
            <StatusDot
              tone="failure"
              label={error}
              className="text-meta text-ink"
            />
          </p>
        )}
      </div>
    </li>
  );
}

function ConnectForm({
  tool,
  name,
  connected,
  signIn,
  onDone,
}: {
  tool: Tool;
  name: string;
  connected: boolean;
  signIn: SignIn;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(
    connectTool,
    {},
  );
  const id = useId();
  const guide = TOOL_GUIDES[tool];
  // The clicked button's name and value arrive with the form, as `mode`.
  const [signingIn, setSigningIn] = useState(false);
  const error =
    state.error ?? (guide.signIn && !state.values ? signIn.problem : null);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <div className="grid gap-5 rounded-tile bg-surface-soft p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-8">
      <form action={action} className="flex min-w-0 flex-col gap-4">
        <input type="hidden" name="tool" value={tool} />
        {guide.fields.map((field) => (
          <FormField
            key={field.name}
            id={`${id}-${field.name}`}
            field={field}
            invalid={state.field === field.name}
            errorId={`${id}-error`}
            defaultValue={state.values?.[field.name]}
          />
        ))}
        {guide.signIn && (
          <RedirectUri id={`${id}-redirect`} value={signIn.redirectUri} />
        )}

        {error && (
          <div
            id={`${id}-error`}
            role="alert"
            className="rounded-tile bg-alert-soft px-4 py-3"
          >
            <StatusDot
              tone="failure"
              label={error}
              className="text-meta text-ink"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {guide.signIn ? (
            <>
              <Button
                type="submit"
                variant="primary"
                name="mode"
                value="sign-in"
                disabled={pending}
                onClick={() => setSigningIn(true)}
              >
                {pending && signingIn
                  ? `Opening ${name}…`
                  : `Sign in with ${name}`}
              </Button>
              <Button
                type="submit"
                name="mode"
                value="app"
                disabled={pending}
                onClick={() => setSigningIn(false)}
              >
                {pending && !signingIn
                  ? `Checking with ${name}…`
                  : 'Connect without tickets'}
              </Button>
            </>
          ) : (
            <Button type="submit" variant="primary" disabled={pending}>
              {pending
                ? `Checking with ${name}…`
                : connected
                  ? 'Save and sync'
                  : `Connect ${name}`}
            </Button>
          )}
          <Button variant="ghost" disabled={pending} onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>

      <section aria-labelledby={`${id}-steps`} className="min-w-0">
        <h3 id={`${id}-steps`} className="text-meta font-medium">
          Where to find these
        </h3>
        <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-meta text-text marker:text-muted">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {guide.signIn && (
          <p className="mt-3 text-meta text-muted">
            {guide.signIn.alternative}
          </p>
        )}
      </section>
    </div>
  );
}

/** The redirect URI to register with the tool, ready to copy. */
function RedirectUri({ id, value }: { id: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-ink">
        Redirect URI
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={value}
          aria-describedby={`${id}-hint`}
          onFocus={(event) => event.currentTarget.select()}
          className={cn(inputClass, 'min-w-0 font-mono text-mono')}
        />
        <Button
          onClick={() =>
            void navigator.clipboard.writeText(value).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-meta-sm text-muted">
        Add this to the Dossier app in NinjaOne. It has to match exactly.
      </p>
    </div>
  );
}

const inputClass =
  'h-10 w-full rounded-input bg-sheet px-3 text-body text-ink shadow-card placeholder:text-muted aria-invalid:outline-2 aria-invalid:outline-alert';

function FormField({
  id,
  field,
  invalid,
  errorId,
  defaultValue,
}: {
  id: string;
  field: GuideField;
  invalid: boolean;
  errorId: string;
  defaultValue?: string;
}) {
  const described = [field.hint && `${id}-hint`, invalid && errorId]
    .filter(Boolean)
    .join(' ');
  const common = {
    id,
    name: field.name,
    'aria-invalid': invalid || undefined,
    'aria-describedby': described || undefined,
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-meta font-medium text-ink">
        {field.label}
        {field.optional && (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </label>
      {field.options ? (
        // No preselected choice: a wrong region looks like a wrong client ID.
        <select
          {...common}
          required={!field.optional}
          defaultValue={defaultValue ?? ''}
          className={inputClass}
        >
          <option value="" disabled>
            Choose…
          </option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={
            field.secret ? 'password' : field.type === 'url' ? 'url' : 'text'
          }
          required={!field.optional}
          autoComplete={field.secret ? 'new-password' : 'off'}
          spellCheck={false}
          placeholder={field.placeholder}
          defaultValue={field.secret ? undefined : defaultValue}
          className={cn(inputClass, field.secret && 'font-mono text-mono')}
        />
      )}
      {field.hint && (
        <p id={`${id}-hint`} className="text-meta-sm text-muted">
          {field.hint}
        </p>
      )}
    </div>
  );
}

function FailureNotice({
  entry,
  primary,
  canManage,
  onFix,
}: {
  entry: ToolEntry;
  primary: boolean;
  canManage: boolean;
  onFix: () => void;
}) {
  const failure = entry.connector!.failure!;
  const headingId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const needsSettings = failure.fix.startsWith('Update');

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-card bg-sheet p-5 shadow-float"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex items-center gap-2.5">
            <ConnectorTile tool={entry.tool} size="sm" />
            <h2 id={headingId} className="text-section font-semibold">
              <StatusDot tone="failure" label={`${entry.name} is failing`} />
            </h2>
          </div>
          <p className="mt-3 text-text">{failure.summary}</p>
          <p className="mt-1.5 font-mono text-mono text-muted">
            {failure.detail}
          </p>
        </div>
        {(!needsSettings || canManage) && (
          <Button
            variant={primary ? 'primary' : 'secondary'}
            disabled={pending}
            onClick={() => {
              if (needsSettings) return onFix();
              setError(null);
              startTransition(async () => {
                const result = await syncTool(entry.tool);
                if (!result.ok) setError(result.error);
              });
            }}
          >
            {pending ? 'Starting…' : failure.fix}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3">
          <StatusDot
            tone="failure"
            label={error}
            className="text-meta text-ink"
          />
        </p>
      )}
    </section>
  );
}
