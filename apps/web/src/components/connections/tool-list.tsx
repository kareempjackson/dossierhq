'use client';

import type { Tool } from '@dossierhq/contracts';
import { useRouter } from 'next/navigation';
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from 'react';
import {
  browseSharePoint,
  connectTool,
  disconnectTool,
  forgetSignInProblem,
  syncTool,
  testConnection,
  testCredentials,
  type BrowseState,
  type ConnectState,
  type TestState,
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
              : 'Only owners and admins can connect or disconnect tools.'}
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
          <ManagePanel
            tool={tool}
            name={name}
            connector={connector}
            canManage={canManage}
            pending={pending}
            onSync={() => run(() => syncTool(tool))}
            onToggle={onToggle}
          />
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

/** A connected tool's details, and what can be done with it. */
function ManagePanel({
  tool,
  name,
  connector,
  canManage,
  pending,
  onSync,
  onToggle,
}: {
  tool: Tool;
  name: string;
  connector: NonNullable<ToolEntry['connector']>;
  canManage: boolean;
  pending: boolean;
  onSync: () => void;
  onToggle: (mode: NonNullable<Open>['mode']) => void;
}) {
  const [test, setTest] = useState<TestState | null>(null);
  const [testing, startTest] = useTransition();

  return (
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
        <Button disabled={pending || connector.syncing} onClick={onSync}>
          {connector.syncing ? 'Syncing…' : 'Sync now'}
        </Button>
        {/* Waits for a running sync, so it waits with the button off. */}
        <Button
          disabled={testing || connector.syncing}
          onClick={() => {
            setTest(null);
            startTest(async () => setTest(await testConnection(tool)));
          }}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        {canManage && (
          <>
            <Button onClick={() => onToggle('form')}>Update credentials</Button>
            <Button variant="ghost" onClick={() => onToggle('disconnect')}>
              Disconnect
            </Button>
          </>
        )}
      </div>
      {test && (
        <TestResult
          test={test}
          className="mt-3"
          worked={
            connector.failure
              ? `The saved credentials work with ${name} again. Sync now to bring Dossier up to date.`
              : `The saved credentials still work with ${name}.`
          }
        />
      )}
    </div>
  );
}

/** What a connection test found, said where the button was pressed. */
function TestResult({
  test,
  worked,
  id,
  className,
}: {
  test: TestState;
  worked: string;
  id?: string;
  className?: string;
}) {
  return test.ok ? (
    <div
      id={id}
      role="status"
      className={cn('rounded-tile bg-brand-soft px-4 py-3', className)}
    >
      <StatusDot
        tone="positive"
        label={worked}
        className="text-meta text-ink"
      />
      <p className="mt-1 font-mono text-mono break-words text-muted">
        {test.account}
      </p>
    </div>
  ) : (
    <div
      id={id}
      role="alert"
      className={cn('rounded-tile bg-alert-soft px-4 py-3', className)}
    >
      <StatusDot
        tone="failure"
        label={test.error}
        className="text-meta text-ink"
      />
    </div>
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
  // A test, newer than the last submit until the next one.
  const form = useRef<HTMLFormElement>(null);
  const [test, setTest] = useState<TestState | null>(null);
  const [testing, startTest] = useTransition();
  const error = test
    ? null
    : (state.error ?? (guide.signIn && !state.values ? signIn.problem : null));
  const invalidField = test ? (test.ok ? undefined : test.field) : state.field;

  // Not a submit: a form action would clear the secrets that were typed.
  function runTest() {
    if (!form.current?.reportValidity()) return;
    const formData = new FormData(form.current);
    setTest(null);
    startTest(async () => setTest(await testCredentials(formData)));
  }

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <div className="grid gap-5 rounded-tile bg-surface-soft p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-8">
      <form
        ref={form}
        action={action}
        onSubmit={() => setTest(null)}
        className="flex min-w-0 flex-col gap-4"
      >
        <input type="hidden" name="tool" value={tool} />
        {guide.fields.map((field) => (
          <FormField
            key={field.name}
            id={`${id}-${field.name}`}
            field={field}
            invalid={invalidField === field.name}
            errorId={`${id}-error`}
            defaultValue={state.values?.[field.name]}
          />
        ))}
        {tool === 'sharepoint' && <SharePointPlaces form={form} />}
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
        {test && (
          <TestResult
            id={`${id}-error`}
            test={test}
            worked={`These credentials work with ${name}.`}
          />
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
            <>
              <Button
                type="submit"
                variant="primary"
                disabled={pending || testing}
              >
                {pending
                  ? `Checking with ${name}…`
                  : connected
                    ? 'Save and sync'
                    : `Connect ${name}`}
              </Button>
              <Button disabled={pending || testing} onClick={runTest}>
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
            </>
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

/** The app's details, which every look at SharePoint needs. */
const SHAREPOINT_APP_FIELDS = ['tenantId', 'clientId', 'clientSecret'];

/** How many folders deep the client folders can be. */
const MAX_FOLDER_LEVELS = 4;

/**
 * Where SharePoint's client folders are, picked rather than typed: Find
 * sites lists every site the app can read, then the chosen site's libraries
 * and folders fill the dropdowns. Sends `siteUrl`, `library` and `folder`
 * with the form.
 */
function SharePointPlaces({
  form,
}: {
  form: RefObject<HTMLFormElement | null>;
}) {
  const id = useId();
  const [sites, setSites] = useState<{ name: string; url: string }[] | null>(
    null,
  );
  const [siteUrl, setSiteUrl] = useState('');
  const [libraries, setLibraries] = useState<string[]>([]);
  const [library, setLibrary] = useState('');
  /** The folder chosen at each level, and the folders offered at each. */
  const [path, setPath] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[][]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [looking, startLooking] = useTransition();

  /** Asks what the app can see, with the details typed above. */
  function look(
    query: { siteUrl?: string; library?: string; folder?: string },
    then: (places: Extract<BrowseState, { ok: true }>) => void,
  ) {
    const element = form.current;
    if (!element) return;
    for (const name of SHAREPOINT_APP_FIELDS) {
      const input = element.elements.namedItem(name);
      if (input instanceof HTMLInputElement && !input.reportValidity()) return;
    }
    const typed = new FormData(element);
    const data = new FormData();
    for (const name of SHAREPOINT_APP_FIELDS) {
      data.set(name, String(typed.get(name) ?? ''));
    }
    for (const [name, value] of Object.entries(query)) data.set(name, value);
    setProblem(null);
    startLooking(async () => {
      const result = await browseSharePoint(data);
      if (result.ok) then(result);
      else setProblem(result.error);
    });
  }

  function findSites() {
    look({}, (result) => {
      const found = result.sites ?? [];
      setSites(found);
      if (found.length === 0) {
        setProblem(
          'The app can sign in but can’t see any sites. Check it has the Sites.Read.All application permission, with admin consent.',
        );
      }
      // Keep what was chosen if it's still there.
      if (!found.some((site) => site.url === siteUrl)) chooseSite('');
    });
  }

  function chooseSite(url: string) {
    setSiteUrl(url);
    setLibraries([]);
    setLibrary('');
    setPath([]);
    setLevels([]);
    if (!url) return;
    look({ siteUrl: url }, (result) => {
      setLibraries(result.libraries ?? []);
      setLibrary(result.library ?? '');
      setLevels([result.folders ?? []]);
    });
  }

  function chooseLibrary(name: string) {
    setLibrary(name);
    setPath([]);
    setLevels([]);
    look({ siteUrl, library: name }, (result) =>
      setLevels([result.folders ?? []]),
    );
  }

  function chooseFolder(level: number, name: string) {
    const chosen = [...path.slice(0, level), ...(name ? [name] : [])];
    const kept = levels.slice(0, level + 1);
    setPath(chosen);
    setLevels(kept);
    if (!name) return;
    look({ siteUrl, library, folder: chosen.join('/') }, (result) =>
      setLevels([...kept, result.folders ?? []]),
    );
  }

  // The folders in the chosen place: the ones that join clients.
  const inside = levels[path.length];
  const where = path.length ? path.join('/') : `the top of ${library}`;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          htmlFor={`${id}-site`}
          className="text-meta font-medium text-ink"
        >
          Site
        </label>
        <div className="flex gap-2">
          <select
            id={`${id}-site`}
            name="siteUrl"
            required
            value={siteUrl}
            disabled={!sites || looking}
            onChange={(event) => chooseSite(event.target.value)}
            aria-describedby={`${id}-site-hint`}
            className={cn(inputClass, 'min-w-0')}
          >
            <option value="" disabled>
              {sites ? 'Choose a site…' : 'Find your sites first'}
            </option>
            {sites?.map((site) => (
              <option key={site.url} value={site.url}>
                {/* The path only tells apart sites with the same name. */}
                {sites.filter((other) => other.name === site.name).length > 1
                  ? `${site.name} · ${new URL(site.url).pathname}`
                  : site.name}
              </option>
            ))}
          </select>
          <Button disabled={looking} onClick={findSites}>
            {looking && !sites
              ? 'Finding…'
              : sites
                ? 'Find again'
                : 'Find sites'}
          </Button>
        </div>
        <p id={`${id}-site-hint`} className="text-meta-sm text-muted">
          Lists the sites this app can read, once its details are in.
        </p>
      </div>

      {libraries.length > 1 ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={`${id}-library`}
            className="text-meta font-medium text-ink"
          >
            Library
          </label>
          <select
            id={`${id}-library`}
            name="library"
            value={library}
            disabled={looking}
            onChange={(event) => chooseLibrary(event.target.value)}
            className={inputClass}
          >
            {libraries.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="library" value={library} />
      )}

      <input type="hidden" name="folder" value={path.join('/')} />
      {siteUrl && levels[0] && levels[0].length > 0 && (
        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 text-meta font-medium text-ink">
            Folder of client folders
          </legend>
          {levels.slice(0, MAX_FOLDER_LEVELS).map(
            (options, level) =>
              options.length > 0 && (
                <select
                  key={[library, ...path.slice(0, level)].join('/')}
                  aria-label={
                    level === 0
                      ? `Folder in ${library}`
                      : `Folder in ${path[level - 1]}`
                  }
                  value={path[level] ?? ''}
                  disabled={looking}
                  onChange={(event) => chooseFolder(level, event.target.value)}
                  className={inputClass}
                >
                  <option value="">
                    {level === 0
                      ? 'None: client folders are at the top'
                      : `None: client folders are right in ${path[level - 1]}`}
                  </option>
                  {options.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ),
          )}
        </fieldset>
      )}

      {siteUrl && (
        <p aria-live="polite" className="text-meta text-text">
          {looking || !inside
            ? 'Looking…'
            : inside.length === 0
              ? `There are no folders in ${where} yet.`
              : `Dossier will look in ${where}: ${inside.length === 1 ? '1 folder' : `${inside.length} folders`}, such as ${listed(inside.slice(0, 3))}. Each joins the client with the same name.`}
        </p>
      )}

      {problem && (
        <div role="alert" className="rounded-tile bg-alert-soft px-4 py-3">
          <StatusDot
            tone="failure"
            label={problem}
            className="text-meta text-ink"
          />
        </div>
      )}
    </>
  );
}

/** "A", "A and B", "A, B and C". */
function listed(names: string[]): string {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
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
