'use client';

import { LogIn, PlugZap, RefreshCw, Search, Unplug } from 'lucide-react';
import Link from 'next/link';
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
  type ActionResult,
  type BrowseState,
  type ConnectState,
  type TestState,
} from '@/app/(workspace)/connections/actions';
import { Button, ButtonLink } from '@/components/ui/button';
import { Folder } from '@/components/ui/folder';
import { Input } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Select } from '@/components/ui/select';
import { BusyIcon } from '@/components/ui/spinner';
import type { ToolField, ToolGuide } from '@/lib/catalog';
import type { ToolStatus } from '@/lib/connector-status';
import { StateTag } from './state-tag';
import { ToolIcon } from './tool-icon';

/**
 * One tool, opened from Connections: a connected tool's details and what can
 * be done with it, or the form to connect it. Owners and admins connect,
 * change and disconnect; everyone can test a saved connection and sync it.
 * It changes in place as the tool's state does: views fade in, and work in
 * progress shows as a spinner in the button and a bar, never a jump.
 */
export function ConnectTool({
  tool,
  guide,
  others,
  recentReads,
  canManage,
  signIn,
}: {
  tool: ToolStatus;
  guide: ToolGuide;
  others: ToolStatus[];
  /** Reads from this tool in the last 90 days; null if unknown. */
  recentReads: number | null;
  canManage: boolean;
  /** NinjaOne: where it sends people back, and a sign-in problem to show once. */
  signIn?: { redirectUri: string; problem: string | null };
}) {
  // Kept from the first render: clearing its cookie redraws the page without it.
  const [problem] = useState(signIn?.problem ?? null);
  const [editing, setEditing] = useState(tool.state === 'off' || !!problem);
  const [fixing, startFixing] = useTransition();
  const [fixError, setFixError] = useState<string | null>(null);

  // When the tool connects, fails or disconnects, show what fits: the form
  // for a tool that's off, the details otherwise. Adjusted while rendering,
  // so the panel changes in place rather than being drawn again.
  const [shownState, setShownState] = useState(tool.state);
  if (shownState !== tool.state) {
    setShownState(tool.state);
    setEditing(tool.state === 'off');
  }

  // The problem came in a cookie; it's on screen now, so let it go.
  useEffect(() => {
    if (problem) void forgetSignInProblem();
  }, [problem]);

  const fix = () => {
    if (!tool.failure) return;
    if (tool.failure.fix.startsWith('Update')) return setEditing(true);
    setFixError(null);
    startFixing(async () => {
      const result = await syncTool(tool.id);
      if (!result.ok) setFixError(result.error);
    });
  };

  const view =
    editing && canManage ? 'form' : tool.state === 'off' ? 'off' : 'manage';

  return (
    <div className="rounded-3xl bg-grey-2 p-2.5 sm:p-3">
      {tool.failure && (
        <div
          role="alert"
          className="mb-3 animate-enter rounded-2xl bg-attention-soft p-4 text-attention"
        >
          <p className="font-medium">{tool.name} is failing</p>
          <p className="mt-1 text-small">{tool.failure.summary}</p>
          <p className="mt-1 text-[0.75rem]">
            Failing since {tool.failure.since} · last good sync{' '}
            {tool.lastGoodSync}
          </p>
          {(canManage || !tool.failure.fix.startsWith('Update')) && (
            <Button
              variant="ink"
              size="sm"
              className="mt-3"
              disabled={fixing || tool.syncing}
              onClick={fix}
            >
              <BusyIcon icon={RefreshCw} busy={fixing || tool.syncing} />
              {tool.failure.fix}
            </Button>
          )}
          {fixError && (
            <p className="mt-2 animate-enter text-small">{fixError}</p>
          )}
        </div>
      )}
      <Folder
        tone={view === 'form' ? 'act' : 'calm'}
        bodyClassName="bg-white p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2 text-h2">
            <ToolIcon />
            {view === 'form'
              ? `${tool.state === 'off' ? 'Connect' : 'Update'} ${tool.name}`
              : tool.name}
          </h2>
          <Link
            href="/connections"
            className="rounded-sm text-small text-muted hover:text-ink"
          >
            Close
          </Link>
        </div>
        <p className="mt-2 text-small text-muted">{guide.intro}</p>
        {/* Keyed by what's shown, so switching between them fades in. */}
        <div key={view} className="animate-enter">
          {view === 'form' ? (
            <ToolForm
              tool={tool}
              guide={guide}
              redirectUri={signIn?.redirectUri}
              problem={problem}
              onDone={
                tool.state === 'off' ? undefined : () => setEditing(false)
              }
            />
          ) : view === 'off' ? (
            <p className="mt-6 rounded-xl bg-grey-1 px-4 py-3.5 text-small text-muted">
              Only owners and admins can connect {tool.name}.
            </p>
          ) : (
            <Manage
              tool={tool}
              guide={guide}
              recentReads={recentReads}
              canManage={canManage}
              onUpdate={() => setEditing(true)}
            />
          )}
        </div>
      </Folder>

      <ul className="mt-3 flex flex-col gap-2" aria-label="Other tools">
        {others.map((other) => (
          <li key={other.id}>
            <Link
              href={`/connections/${other.id}`}
              className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 transition-colors hover:bg-grey-1"
            >
              <span className="text-small font-medium">{other.name}</span>
              <StateTag tool={other} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A connected tool: what it reads, and what can be done with it. */
function Manage({
  tool,
  guide,
  recentReads,
  canManage,
  onUpdate,
}: {
  tool: ToolStatus;
  guide: ToolGuide;
  recentReads: number | null;
  canManage: boolean;
  onUpdate: () => void;
}) {
  const [busy, setBusy] = useState<'sync' | 'test' | 'disconnect' | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const details: [string, string][] = [
    ['Reads', guide.reads],
    ['Access', `Read only. Dossier never writes to ${tool.name}.`],
    ['Checks', 'Every 15 minutes, and when you sync now'],
    [
      'Recent reads',
      recentReads === null
        ? '—'
        : `${recentReads.toLocaleString('en-GB')} ${recentReads === 1 ? 'read' : 'reads'} in the last 90 days`,
    ],
    ['Last good sync', tool.lastGoodSync],
  ];

  const run = (
    what: 'sync' | 'disconnect',
    action: () => Promise<ActionResult>,
  ) => {
    setError(null);
    setTest(null);
    setBusy(what);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      setBusy(null);
    });
  };

  const check = () => {
    setError(null);
    setTest(null);
    setBusy('test');
    startTransition(async () => {
      setTest(await testConnection(tool.id));
      setBusy(null);
    });
  };

  const syncing = tool.syncing || busy === 'sync';

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <StateTag tool={tool} />
        <span className="text-small text-muted">{tool.line}</span>
      </div>
      {syncing && (
        <ProgressBar label={`Syncing ${tool.name}`} className="mt-3" />
      )}
      <p className="mt-2 font-mono text-label tracking-normal text-muted">
        {tool.account}
      </p>
      <p className="mt-1 min-h-[1.15rem] text-small">{tool.scope}</p>
      <dl className="mt-5 flex flex-col gap-1.5">
        {details.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 rounded-lg bg-grey-1 px-3 py-2.5 text-small sm:grid-cols-[9rem_1fr]"
          >
            <dt className="text-muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {confirming ? (
        <div className="mt-6 animate-enter rounded-2xl bg-attention-soft p-4">
          <p className="font-medium">Disconnect {tool.name}?</p>
          <p className="mt-1 text-small">
            Dossier forgets the credentials and everything it read from{' '}
            {tool.name}. Clients that only {tool.name} knows about are removed,
            with their contracts and files. The audit log keeps its entries. You
            can connect it again at any time.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="ink"
              size="sm"
              disabled={busy !== null}
              onClick={() => run('disconnect', () => disconnectTool(tool.id))}
            >
              <BusyIcon icon={Unplug} busy={busy === 'disconnect'} />
              Disconnect {tool.name}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            variant="ink"
            size="sm"
            disabled={busy !== null || tool.syncing}
            onClick={() => run('sync', () => syncTool(tool.id))}
          >
            <BusyIcon icon={RefreshCw} busy={syncing} />
            Sync now
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || tool.syncing}
            onClick={check}
          >
            <BusyIcon icon={PlugZap} busy={busy === 'test'} />
            Test connection
          </Button>
          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={onUpdate}
              >
                Update credentials
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => setConfirming(true)}
              >
                Disconnect
              </Button>
            </>
          )}
        </div>
      )}
      <p role="status" className="mt-3 text-small text-muted empty:hidden">
        {busy === 'test'
          ? `Checking with ${tool.name}… This waits for any sync that’s running.`
          : ''}
      </p>
      {test && (
        <TestResult
          test={test}
          success={
            tool.state === 'reconnect'
              ? `The saved credentials work with ${tool.name} again. Sync now to catch up.`
              : `The saved credentials still work with ${tool.name}.`
          }
        />
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 animate-enter text-small text-attention"
        >
          {error}
        </p>
      )}
      {!canManage && (
        <p className="mt-4 text-[0.75rem] text-muted">
          Only owners and admins can change or disconnect {tool.name}.
        </p>
      )}
    </div>
  );
}

function TestResult({ test, success }: { test: TestState; success: string }) {
  return test.ok ? (
    <p
      role="status"
      className="mt-3 animate-enter rounded-xl bg-healthy-soft px-4 py-3 text-small text-healthy"
    >
      {success} <span className="font-mono text-[0.75rem]">{test.account}</span>
    </p>
  ) : (
    <p
      role="alert"
      className="mt-3 animate-enter rounded-xl bg-attention-soft px-4 py-3 text-small text-attention"
    >
      {test.error}
    </p>
  );
}

/** The fields to connect a tool, and its buttons. */
function ToolForm({
  tool,
  guide,
  redirectUri,
  problem,
  onDone,
}: {
  tool: ToolStatus;
  guide: ToolGuide;
  /** NinjaOne: the address to list in the NinjaOne app. */
  redirectUri?: string;
  /** Why the last NinjaOne sign-in didn't work, if it didn't. */
  problem: string | null;
  /** Back to the details, when updating a connected tool. */
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(
    connectTool,
    {},
  );
  const [test, setTest] = useState<TestState | null>(null);
  const [testing, startTesting] = useTransition();
  /** Which submit button was pressed, for its spinner and the note below. */
  const [mode, setMode] = useState<'connect' | 'sign-in' | 'app'>('connect');
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const updating = tool.state !== 'off';

  // Saved: the page refreshes with the connection; show its details.
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);

  const runTest = () => {
    const element = form.current;
    if (!element || !element.reportValidity()) return;
    setTest(null);
    startTesting(async () =>
      setTest(await testCredentials(new FormData(element))),
    );
  };

  const error =
    test && !test.ok
      ? test.error
      : (state.error ?? (state.values ? null : problem));
  const invalid = (test && !test.ok ? test.field : undefined) ?? state.field;
  const note = pending
    ? mode === 'sign-in'
      ? `Opening ${tool.name}…`
      : `Checking with ${tool.name}, then starting the first sync…`
    : testing
      ? `Checking with ${tool.name}…`
      : '';

  return (
    <form ref={form} action={action} className="mt-6 flex flex-col gap-5">
      <input type="hidden" name="tool" value={tool.id} />
      {guide.fields.map((field) => (
        <Field
          key={field.name}
          id={`${id}-${field.name}`}
          field={field}
          defaultValue={state.values?.[field.name]}
          invalid={invalid === field.name}
        />
      ))}
      {guide.id === 'ninjaone' && redirectUri && (
        <RedirectUri id={`${id}-redirect`} value={redirectUri} />
      )}
      {guide.id === 'sharepoint' && <SharePointPlaces form={form} />}

      {error && (
        <p role="alert" className="animate-enter text-small text-attention">
          {error}
        </p>
      )}
      {test?.ok && (
        <TestResult
          test={test}
          success={`These work with ${tool.name}. Connect to start reading.`}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {guide.signIn ? (
          <>
            <Button
              type="submit"
              name="mode"
              value="sign-in"
              variant="act"
              disabled={pending}
              onClick={() => setMode('sign-in')}
            >
              <BusyIcon icon={LogIn} busy={pending && mode === 'sign-in'} />
              Sign in with {tool.name}
            </Button>
            <Button
              type="submit"
              name="mode"
              value="app"
              variant="outline"
              disabled={pending}
              onClick={() => setMode('app')}
            >
              <BusyIcon icon={PlugZap} busy={pending && mode === 'app'} />
              Connect without tickets
            </Button>
          </>
        ) : (
          <>
            <Button
              type="submit"
              variant="act"
              disabled={pending}
              onClick={() => setMode('connect')}
            >
              <BusyIcon icon={PlugZap} busy={pending} />
              {updating ? 'Save and sync' : `Connect ${tool.name}`}
            </Button>
            <Button
              variant="outline"
              disabled={pending || testing}
              onClick={runTest}
            >
              <BusyIcon icon={Search} busy={testing} />
              Test connection
            </Button>
          </>
        )}
        {onDone ? (
          <Button variant="outline" disabled={pending} onClick={onDone}>
            Cancel
          </Button>
        ) : (
          <ButtonLink href="/connections" variant="outline">
            Cancel
          </ButtonLink>
        )}
      </div>
      <p role="status" className="-mt-2 text-small text-muted empty:hidden">
        {note}
      </p>
    </form>
  );
}

function Field({
  id,
  field,
  defaultValue,
  invalid,
}: {
  id: string;
  field: ToolField;
  defaultValue?: string;
  invalid: boolean;
}) {
  const hint = field.hint ? `${id}-hint` : undefined;
  const secret = field.type === 'secret';
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-small font-medium">
        {field.label}
        {field.optional && (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </label>
      {field.type === 'select' ? (
        <Select
          // Keyed so a value sent back after an error fills it again.
          key={defaultValue}
          id={id}
          name={field.name}
          required
          defaultValue={defaultValue ?? ''}
          aria-describedby={hint}
          aria-invalid={invalid || undefined}
        >
          <option value="" disabled>
            Choose…
          </option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          key={secret ? undefined : defaultValue}
          id={id}
          name={field.name}
          type={secret ? 'password' : field.type}
          required={!field.optional}
          placeholder={field.placeholder}
          // Secrets are never filled back in.
          defaultValue={secret ? undefined : defaultValue}
          autoComplete={secret ? 'new-password' : 'off'}
          spellCheck={false}
          aria-describedby={hint}
          aria-invalid={invalid || undefined}
        />
      )}
      {field.hint && (
        <p id={hint} className="text-[0.75rem] text-muted">
          {field.hint}
        </p>
      )}
    </div>
  );
}

function RedirectUri({ id, value }: { id: string; value: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-small font-medium">
        Redirect URI
      </label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          readOnly
          aria-describedby={`${id}-hint`}
          className="pr-20 font-mono text-small"
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              // Clipboard blocked: the address is on screen to copy by hand.
            }
          }}
          className="absolute top-1/2 right-4 -translate-y-1/2 rounded-sm text-small font-medium"
        >
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <p id={`${id}-hint`} className="text-[0.75rem] text-muted">
        Add this to the Dossier app in NinjaOne. It has to match exactly.
      </p>
    </div>
  );
}

const SHAREPOINT_APP_FIELDS = ['tenantId', 'clientId', 'clientSecret'];
/** How deep the client folders can be picked. */
const MAX_FOLDER_LEVELS = 4;

/**
 * Choosing where the client folders are: find the sites the app can read,
 * pick one, its library if it has several, and the folder that holds one
 * folder per client. Each step asks the API with the app's details as typed.
 */
function SharePointPlaces({
  form,
}: {
  form: RefObject<HTMLFormElement | null>;
}) {
  const id = useId();
  const [sites, setSites] = useState<{ name: string; url: string }[]>([]);
  const [siteUrl, setSiteUrl] = useState('');
  const [libraries, setLibraries] = useState<string[]>([]);
  const [library, setLibrary] = useState('');
  const [path, setPath] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[][]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [looking, startLooking] = useTransition();

  const look = (
    query: Record<string, string>,
    then: (result: Extract<BrowseState, { ok: true }>) => void,
  ) => {
    const element = form.current;
    if (!element) return;
    const inputs = SHAREPOINT_APP_FIELDS.map(
      (name) => element.elements.namedItem(name) as HTMLInputElement | null,
    );
    if (inputs.some((input) => input && !input.reportValidity())) return;
    const body = new FormData();
    for (const input of inputs) if (input) body.set(input.name, input.value);
    for (const [name, value] of Object.entries(query)) body.set(name, value);
    setProblem(null);
    startLooking(async () => {
      const result = await browseSharePoint(body);
      if (result.ok) then(result);
      else setProblem(result.error);
    });
  };

  const findSites = () =>
    look({}, (result) => {
      const found = result.sites ?? [];
      setSites(found);
      if (found.length === 0) {
        setProblem(
          'This app can’t see any sites. Check it has the Sites.Read.All application permission, with admin consent.',
        );
      }
      if (!found.some((site) => site.url === siteUrl)) {
        setSiteUrl('');
        setLibraries([]);
        setLibrary('');
        setPath([]);
        setLevels([]);
      }
    });

  const chooseSite = (url: string) => {
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
  };

  const chooseLibrary = (name: string) => {
    setLibrary(name);
    setPath([]);
    setLevels([]);
    look({ siteUrl, library: name }, (result) =>
      setLevels([result.folders ?? []]),
    );
  };

  const chooseFolder = (level: number, name: string) => {
    const next = [...path.slice(0, level), ...(name ? [name] : [])];
    setPath(next);
    setLevels((current) => current.slice(0, level + 1));
    if (!name || next.length >= MAX_FOLDER_LEVELS) return;
    look({ siteUrl, library, folder: next.join('/') }, (result) => {
      const folders = result.folders ?? [];
      if (folders.length > 0) {
        setLevels((current) => [...current.slice(0, level + 1), folders]);
      }
    });
  };

  // Two sites can share a name; their addresses tell them apart.
  const label = (site: { name: string; url: string }) =>
    sites.filter((each) => each.name === site.name).length > 1
      ? `${site.name} · ${new URL(site.url).pathname}`
      : site.name;
  const where = [library, ...path].filter(Boolean).join(' / ');
  // The folders inside the one chosen: the client folders.
  const clientFolders = levels[path.length] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-site`} className="text-small font-medium">
          Site
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Select
              id={`${id}-site`}
              name="siteUrl"
              required
              value={siteUrl}
              disabled={sites.length === 0}
              onChange={(event) => chooseSite(event.target.value)}
            >
              <option value="">
                {sites.length === 0
                  ? 'Find your sites first'
                  : 'Choose a site…'}
              </option>
              {sites.map((site) => (
                <option key={site.url} value={site.url}>
                  {label(site)}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="outline"
            className="h-11"
            disabled={looking}
            onClick={findSites}
          >
            <BusyIcon icon={Search} busy={looking} />
            Find sites
          </Button>
        </div>
        <p className="text-[0.75rem] text-muted">
          Lists the sites this app can read, once its details are in.
        </p>
      </div>

      {libraries.length > 1 ? (
        <div className="flex animate-enter flex-col gap-2">
          <label htmlFor={`${id}-library`} className="text-small font-medium">
            Library
          </label>
          <Select
            id={`${id}-library`}
            name="library"
            value={library}
            disabled={looking}
            onChange={(event) => chooseLibrary(event.target.value)}
          >
            {libraries.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <input type="hidden" name="library" value={library} />
      )}

      {levels.map((folders, level) =>
        folders.length > 0 ? (
          <div key={level} className="flex animate-enter flex-col gap-2">
            <label
              htmlFor={`${id}-folder-${level}`}
              className="text-small font-medium"
            >
              {level === 0 ? 'Folder with the client folders' : 'Inside it'}
            </label>
            <Select
              id={`${id}-folder-${level}`}
              value={path[level] ?? ''}
              disabled={looking}
              onChange={(event) => chooseFolder(level, event.target.value)}
            >
              <option value="">
                {level === 0
                  ? 'None: client folders are at the top'
                  : `None: client folders are right in ${path[level - 1]}`}
              </option>
              {folders.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        ) : null,
      )}
      <input type="hidden" name="folder" value={path.join('/')} />

      {/* Kept while looking, so it doesn't blink; it updates once the answer's in. */}
      {siteUrl && !problem && (
        <p
          aria-live="polite"
          className={`text-[0.75rem] text-muted transition-opacity ${looking ? 'opacity-50' : ''}`}
        >
          Dossier will look in {where || 'the site’s main library'}
          {clientFolders.length > 0 &&
            `: ${clientFolders.length} ${clientFolders.length === 1 ? 'folder' : 'folders'}, such as ${clientFolders.slice(0, 3).join(', ')}`}
          . Each joins the client with the same name.
        </p>
      )}
      {problem && (
        <p role="alert" className="animate-enter text-small text-attention">
          {problem}
        </p>
      )}
    </div>
  );
}
