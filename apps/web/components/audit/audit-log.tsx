import {
  hasRole,
  TOOL_NAMES,
  type AuditEntry,
  type AuditPage,
} from '@dossierhq/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { ApiError } from '@/lib/api';
import { AUDIT_PATH as PATH } from '@/lib/audit-paths';
import {
  apiKindOf,
  auditHref,
  auditViewFrom,
  type AuditCursor,
  type AuditView,
} from '@/lib/audit-view';
import { getAuditCounts, getAuditPage } from '@/lib/data/audit';
import { getMe } from '@/lib/data/auth';
import { getClientNames } from '@/lib/data/clients';
import { orNull } from '@/lib/data/safe';
import { AuditButtonLink, AuditLink } from './audit-nav';
import { AuditCountsSync, AuditTotal } from './audit-tabs';

type Loaded = { page: AuditPage } | { problem: 'invalid-page' | 'unavailable' };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The audit log's entries from the API, newest first, a page at a time. The
 * view and the page are in the URL (see lib/audit-paths.ts), so tabs and
 * Newer / Older are links: each page can be shared, reloaded or stepped
 * back to. Owners and admins see reads, sign-ins and changes; technicians
 * see reads. The tabs are in the layout (AuditTabs); the counts load on
 * their own (AuditCounts), so the entries never wait for them.
 */
export async function AuditLog({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  // Asked for as an owner would, alongside who's asking, so a view costs
  // one round trip. The API holds technicians to reads either way.
  const asked = auditViewFrom(query, true);
  const [me, first, names] = await Promise.all([
    getMe().catch(orNull),
    loadPage(asked, true),
    getClientNames().catch(orNull),
  ]);
  if (!me) return <Problem invalidPage={false} newest={PATH} />;
  const everything = hasRole(me.role, 'admin');
  const view = everything ? asked : auditViewFrom(query, false);
  // A technician who asked for sign-ins or changes is shown reads instead.
  const loaded =
    everything || !asked.kind ? first : await loadPage(view, false);

  const filter: AuditView = {
    kind: view.kind,
    tool: view.tool,
    client: view.client,
  };
  const clientName = view.client
    ? (names?.get(view.client) ?? view.client)
    : null;
  const timeZone = me.workspace.timeZone;

  return (
    <>
      {clientName && (
        <p className="mt-4 flex items-center gap-2 text-small">
          <span className="rounded-full bg-lilac-soft px-3 py-1 text-lilac-ink">
            {clientName}
          </span>
          <AuditLink
            href={auditHref(PATH, { ...filter, client: undefined })}
            className="text-muted underline-offset-[3px] hover:text-ink hover:underline"
          >
            Show every client
          </AuditLink>
        </p>
      )}

      {'problem' in loaded ? (
        <Problem
          invalidPage={loaded.problem === 'invalid-page'}
          newest={auditHref(PATH, filter)}
        />
      ) : loaded.page.data.length === 0 ? (
        <Empty
          view={filter}
          clientName={clientName}
          turned={Boolean(view.before || view.after)}
          newest={auditHref(PATH, filter)}
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-separate border-spacing-y-1 text-left text-small">
            <caption className="sr-only">
              The audit log: {labelOf(filter, everything)}, newest first
            </caption>
            <thead>
              <tr className="text-[0.6875rem] text-muted">
                {['Time', 'Who', 'What', 'Client', 'Records'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-4 pb-2 font-normal"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loaded.page.data.map((entry) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  timeZone={timeZone}
                  client={
                    entry.clientId
                      ? (names?.get(entry.clientId) ?? entry.clientId)
                      : null
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.75rem] text-muted">
          Reads are kept for 90 days; sign-ins and changes for a year.
        </p>
        {'page' in loaded && (
          <Pager page={loaded.page} view={filter} everything={everything} />
        )}
      </div>
    </>
  );
}

/**
 * The view's counts, read beside its entries and handed to the store for the
 * tabs and the pager. Technicians get reads only.
 */
export async function AuditCounts({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const client = auditViewFrom(await searchParams, false).client;
  const counts = await getAuditCounts(client).catch(orNull);
  return counts && <AuditCountsSync client={client ?? ''} counts={counts} />;
}

/** One page of a view, or why there isn't one. */
function loadPage(
  { before, after, ...view }: AuditView & AuditCursor,
  everything: boolean,
): Promise<Loaded> {
  return getAuditPage({
    kind: apiKindOf(view, everything),
    tool: view.tool,
    clientId: view.client,
    before,
    after,
  }).then(
    (page): Loaded => ({ page }),
    (error: unknown): Loaded => {
      unstable_rethrow(error);
      return {
        problem:
          error instanceof ApiError && error.status === 400
            ? 'invalid-page'
            : 'unavailable',
      };
    },
  );
}

/** The tab a view is, in words: "Changes", "NinjaOne", "All". */
function labelOf({ kind, tool }: AuditView, everything: boolean) {
  if (tool) return TOOL_NAMES[tool];
  if (kind) return kind === 'sign-in' ? 'Sign-ins' : 'Changes';
  return everything ? 'All' : 'All reads';
}

function Row({
  entry,
  client,
  timeZone,
}: {
  entry: AuditEntry;
  client: string | null;
  timeZone: string;
}) {
  return (
    <tr className="odd:[&>td]:bg-grey-1">
      <td className="rounded-l-xl px-4 py-3.5 align-top whitespace-nowrap">
        <time dateTime={entry.at} title={fullTime(entry.at, timeZone)}>
          <span className="block font-semibold">
            {dateOf(entry.at, timeZone)}
          </span>
          <span className="block text-[0.75rem] text-muted">
            {timeOf(entry.at, timeZone)}
          </span>
        </time>
      </td>
      <td className="px-4 py-3.5 align-top">
        <span className="block font-medium">
          {entry.actor?.name ?? 'Dossier'}
        </span>
        <span className="block text-[0.75rem] break-all text-muted">
          {entry.actor?.email ?? 'Automatic'}
        </span>
        {entry.ip && (
          <span className="block text-[0.75rem] text-muted">
            From {placeOf(entry.ip)}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 align-top">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {entry.what}
          {entry.tool && (
            <span className="text-muted">· {TOOL_NAMES[entry.tool]}</span>
          )}
          {entry.outcome === 'failed' && <Tag tone="attention">Failed</Tag>}
        </span>
      </td>
      <td className="px-4 py-3.5 align-top text-muted">
        {client ?? (entry.kind === 'read' ? 'All clients' : '—')}
      </td>
      <td className="rounded-r-xl px-4 py-3.5 align-top text-muted tabular-nums">
        {entry.kind === 'read'
          ? entry.recordCount.toLocaleString('en-GB')
          : '—'}
      </td>
    </tr>
  );
}

/** "5 Nov 2026", in the workspace's time zone. */
function dateOf(at: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(at));
}

/** "14:32 GMT-4": the time, and which time zone it's in. */
function timeOf(at: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
    timeZone,
  }).format(new Date(at));
}

/**
 * Where a sign-in came from, in words. `::1` and `127.0.0.1` are the
 * machine itself (signing in locally); IPv4 addresses the server saw
 * through IPv6 (`::ffff:203.0.113.7`) lose the prefix.
 */
function placeOf(ip: string) {
  const address = ip.replace(/^::ffff:/i, '');
  return address === '::1' || address.startsWith('127.')
    ? 'localhost'
    : address;
}

/** The exact moment, for the tooltip. */
function fullTime(at: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone,
  }).format(new Date(at));
}

/** Newer and Older, with the end the reader is at shown but unavailable. */
function Pager({
  page,
  view,
  everything,
}: {
  page: AuditPage;
  view: AuditView;
  everything: boolean;
}) {
  const paged = Boolean(page.newer || page.older);
  const total = (
    <AuditTotal
      view={view}
      everything={everything}
      onPage={page.data.length}
      paged={paged}
    />
  );
  if (!paged) return total;
  return (
    <nav
      aria-label="Audit log pages"
      className="flex flex-wrap items-center gap-3"
    >
      {total}
      <PageLink
        href={page.newer && auditHref(PATH, { ...view, after: page.newer })}
      >
        <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.75} />
        Newer
      </PageLink>
      <PageLink
        href={page.older && auditHref(PATH, { ...view, before: page.older })}
      >
        Older
        <ChevronRight aria-hidden className="size-3.5" strokeWidth={1.75} />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  return href ? (
    <AuditButtonLink href={href} variant="outline" size="sm">
      {children}
    </AuditButtonLink>
  ) : (
    <Button variant="outline" size="sm" disabled>
      {children}
    </Button>
  );
}

function Empty({
  view,
  clientName,
  turned,
  newest,
}: {
  view: AuditView;
  clientName: string | null;
  turned: boolean;
  newest: string;
}) {
  const forClient = clientName ? ` for ${clientName}` : '';
  const text = turned
    ? 'Nothing further this way.'
    : view.tool
      ? `Nothing read from ${TOOL_NAMES[view.tool]}${forClient} in the last 90 days.`
      : view.kind === 'sign-in'
        ? `No sign-ins in the last year.`
        : view.kind === 'change'
          ? `No changes${forClient} in the last year.`
          : `Nothing${forClient} yet. Every read from a tool, sign-in and change appears here.`;
  return (
    <div className="mt-4 rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
      <p>{text}</p>
      {turned && (
        <AuditLink
          href={newest}
          className="mt-2 inline-block underline underline-offset-[3px] hover:text-ink"
        >
          Back to the newest entries
        </AuditLink>
      )}
    </div>
  );
}

function Problem({
  invalidPage,
  newest,
}: {
  invalidPage: boolean;
  newest: string;
}) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl bg-attention-soft px-4 py-8 text-center text-small text-attention"
    >
      <p>
        {invalidPage
          ? 'That page of the audit log isn’t valid.'
          : 'Dossier couldn’t load the audit log. Try again in a moment.'}
      </p>
      <Link
        href={newest}
        className="mt-2 inline-block font-medium underline underline-offset-[3px]"
      >
        {invalidPage ? 'Start from the newest entries' : 'Try again'}
      </Link>
    </div>
  );
}
