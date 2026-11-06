import {
  hasRole,
  TOOL_NAMES,
  toolSchema,
  type AuditCount,
  type AuditEntry,
  type AuditPage,
} from '@dossierhq/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button, ButtonAnchor, ButtonLink } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { ApiError } from '@/lib/api';
import {
  apiKindOf,
  auditHref,
  auditViewFrom,
  type AuditView,
} from '@/lib/audit-view';
import { cn } from '@/lib/cn';
import { getAuditCounts, getAuditPage } from '@/lib/data/audit';
import { getMe } from '@/lib/data/auth';
import { getClientNames } from '@/lib/data/clients';
import { orNull } from '@/lib/data/safe';

const PATH = '/audit-log';

type Loaded = { page: AuditPage } | { problem: 'invalid-page' | 'unavailable' };

/**
 * The audit log from the API, newest first, a page at a time. The view and
 * the page are in the URL (see lib/audit-view.ts), so filters and Newer /
 * Older are links: each page can be shared, reloaded or stepped back to.
 * Owners and admins see reads, sign-ins and changes; technicians see reads.
 */
export async function AuditLog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, me] = await Promise.all([searchParams, getMe().catch(orNull)]);
  if (!me) return <Problem invalidPage={false} newest={PATH} />;
  const everything = hasRole(me.role, 'admin');
  const view = auditViewFrom(query, everything);
  const { before, after } = view;

  const [loaded, counts, names] = await Promise.all([
    getAuditPage({
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
    ),
    getAuditCounts(view.client).catch(orNull),
    getClientNames().catch(orNull),
  ]);

  const filter: AuditView = {
    kind: view.kind,
    tool: view.tool,
    client: view.client,
  };
  const clientName = view.client
    ? (names?.get(view.client) ?? view.client)
    : null;
  const pills = filterPills(filter, everything, counts);
  const current = pills.find((pill) => pill.current);
  const timeZone = me.workspace.timeZone;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Which entries" className="flex flex-wrap gap-2">
          {pills.map((pill) => (
            <Link
              key={pill.label}
              href={pill.href}
              aria-current={pill.current ? 'page' : undefined}
              className={cn(
                'rounded-full px-3 py-1 text-small transition-colors',
                pill.current
                  ? 'bg-white text-ink ring-1 ring-grey-3'
                  : 'bg-grey-2 text-muted hover:text-ink',
              )}
            >
              {pill.label}
              {pill.count !== undefined &&
                ` ${pill.count.toLocaleString('en-GB')}`}
            </Link>
          ))}
        </nav>
        <ButtonAnchor
          href={auditHref(`${PATH}/export`, filter)}
          download
          variant="outline"
          size="sm"
        >
          Export CSV
        </ButtonAnchor>
      </div>

      {!everything && (
        <p className="mt-3 text-[0.75rem] text-muted">
          Sign-ins and the changes people make are shown to owners and admins.
        </p>
      )}

      {clientName && (
        <p className="mt-4 flex items-center gap-2 text-small">
          <span className="rounded-full bg-lilac-soft px-3 py-1 text-lilac-ink">
            {clientName}
          </span>
          <Link
            href={auditHref(PATH, { ...filter, client: undefined })}
            className="text-muted underline-offset-[3px] hover:text-ink hover:underline"
          >
            Show every client
          </Link>
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
          turned={Boolean(before || after)}
          newest={auditHref(PATH, filter)}
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-separate border-spacing-y-1 text-left text-small">
            <caption className="sr-only">
              The audit log{current ? `: ${current.label}` : ''}, newest first
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
          <Pager page={loaded.page} view={filter} total={current?.count} />
        )}
      </div>
    </>
  );
}

type Pill = { label: string; href: string; count?: number; current: boolean };

/** All, sign-ins and changes (owners and admins), then each tool's reads. */
function filterPills(
  view: AuditView,
  everything: boolean,
  counts: AuditCount[] | null,
): Pill[] {
  const sum = (keep: (count: AuditCount) => boolean) =>
    counts?.filter(keep).reduce((total, count) => total + count.count, 0);
  const client = view.client;
  return [
    {
      label: everything ? 'All' : 'All reads',
      href: auditHref(PATH, { client }),
      count: sum((count) => everything || count.kind === 'read'),
      current: !view.kind && !view.tool,
    },
    ...(everything
      ? (['sign-in', 'change'] as const).map((kind) => ({
          label: kind === 'sign-in' ? 'Sign-ins' : 'Changes',
          href: auditHref(PATH, { kind, client }),
          count: sum((count) => count.kind === kind),
          current: view.kind === kind,
        }))
      : []),
    ...toolSchema.options.map((tool) => ({
      label: TOOL_NAMES[tool],
      href: auditHref(PATH, { tool, client }),
      count: sum((count) => count.kind === 'read' && count.tool === tool),
      current: view.tool === tool,
    })),
  ];
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
  total,
}: {
  page: AuditPage;
  view: AuditView;
  total: number | undefined;
}) {
  if (!page.newer && !page.older) {
    return total ? (
      <p className="text-[0.75rem] text-muted">
        {total.toLocaleString('en-GB')} {total === 1 ? 'entry' : 'entries'}
      </p>
    ) : null;
  }
  return (
    <nav
      aria-label="Audit log pages"
      className="flex flex-wrap items-center gap-3"
    >
      {total !== undefined && (
        <p className="text-[0.75rem] text-muted">
          {total.toLocaleString('en-GB')} entries · {page.data.length} on this
          page
        </p>
      )}
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
    <ButtonLink href={href} variant="outline" size="sm">
      {children}
    </ButtonLink>
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
        <Link
          href={newest}
          className="mt-2 inline-block underline underline-offset-[3px] hover:text-ink"
        >
          Back to the newest entries
        </Link>
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
