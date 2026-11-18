import type { Tool } from '@dossierhq/contracts';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { FieldPattern } from '@/components/brand/field-pattern';
import { PatternList } from '@/components/intelligence/pattern-list';
import { ConnectBanner } from '@/components/shell/connect-nudge';
import { FirstName } from '@/components/shell/first-name';
import { TopBar } from '@/components/shell/top-bar';
import { ButtonLink } from '@/components/ui/button';
import { Folder } from '@/components/ui/folder';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/cn';
import { getMe } from '@/lib/data/auth';
import { orNull } from '@/lib/data/safe';
import type { PatternCard, TodayGroup, TodayView } from '@/lib/today-views';

const NUMBERS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
];

/** "Three clients need you today." */
function needYou(count: number) {
  if (count === 0) return 'Nothing needs you today.';
  const number = NUMBERS[count] ?? String(count);
  return count === 1
    ? 'One client needs you today.'
    : `${number} clients need you today.`;
}

/**
 * Home on a working day: each client that needs you with the top of its
 * Overview, what's coming, and your clients.
 */
export function Today({
  view,
  patterns,
  missing,
}: {
  /** Null when the API couldn't say. */
  view: TodayView | null;
  /** The same problem at several clients; empty until Dossier finds one. */
  patterns: PatternCard[];
  /** Tools not connected yet: the banner asks for one of them. */
  missing: Tool[];
}) {
  return (
    // On a desktop, Home fits the screen: long lists scroll in their panels.
    <div className="lg:flex lg:h-[calc(100dvh-3.5rem)] lg:min-h-[40rem] lg:flex-col">
      <TopBar title="Today" />
      <section className="mt-8 lg:mt-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <h1 className="text-h1 lg:text-h2">
          <Suspense fallback="Hello">
            <Greeting />
          </Suspense>
          <FirstName />.
          {view && (
            <>
              <br />
              {needYou(view.needing)}
            </>
          )}
        </h1>

        {!view ? (
          <p
            role="alert"
            className="mt-8 rounded-2xl bg-grey-1 p-6 text-small text-muted"
          >
            Dossier couldn’t read your clients just now. Reload the page to try
            again.
          </p>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:mt-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-5">
              {view.groups.length > 0 ? (
                <Folder
                  tone="act"
                  tab={`Needs attention · ${view.needing}`}
                  padded={false}
                  className="lg:flex lg:min-h-0 lg:flex-col"
                  bodyClassName="p-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
                >
                  <div className="flex flex-col gap-6">
                    {view.groups.map((group) => (
                      <ClientGroup key={group.clientId} group={group} />
                    ))}
                  </div>
                  {view.moreGroups > 0 && (
                    <div className="px-1.5 pt-5 pb-1.5">
                      <ButtonLink
                        href="/clients?view=attention"
                        variant="outline"
                        size="sm"
                      >
                        {view.moreGroups === 1
                          ? '1 more client needs you'
                          : `${view.moreGroups} more clients need you`}
                      </ButtonLink>
                    </div>
                  )}
                </Folder>
              ) : (
                <div className="rounded-2xl bg-grey-1 p-6">
                  <p className="font-display text-h3">
                    Nothing needs you right now.
                  </p>
                  <p className="mt-1 text-small text-muted">
                    Dossier keeps reading. Anything new lands here.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-5 lg:min-h-0">
                <AcrossClients view={view} grow={patterns.length === 0} />
                <PatternList
                  patterns={patterns}
                  compact
                  className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
                />
              </div>
            </div>

            <div className="mt-10 flex items-baseline justify-between gap-4 lg:mt-5">
              <h2 className="font-sans text-small font-normal tracking-normal text-muted">
                Your clients
              </h2>
              {view.clientCount > 0 && (
                <Link
                  href="/clients"
                  className="rounded-sm text-small text-ink underline-offset-[3px] hover:underline"
                >
                  All {view.clientCount} →
                </Link>
              )}
            </div>
            {view.folders.length > 0 ? (
              // One row on a desktop: four folders, six on a wide screen.
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 lg:[&>li:nth-child(n+5)]:hidden xl:[&>li:nth-child(n+5)]:block">
                {view.folders.map((client) => (
                  <li key={client.id}>
                    <Link
                      href={clientHref(client.id)}
                      className="group block rounded-xl"
                    >
                      <Folder
                        tone={client.tone}
                        bodyClassName="flex min-h-28 flex-col justify-between transition-colors group-hover:bg-grey-3 lg:min-h-20 lg:gap-2"
                      >
                        <p
                          className="text-base lg:truncate"
                          title={client.name}
                        >
                          {client.name}
                        </p>
                        <p className="text-small text-muted">
                          {client.summary}
                        </p>
                      </Folder>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl bg-grey-1 px-4 py-6 text-small text-muted">
                No clients yet. They appear once Dossier reads NinjaOne or Hudu.
              </p>
            )}
          </>
        )}

        <ConnectBanner missing={missing} />
      </section>
    </div>
  );
}

const clientHref = (id: string) => `/clients/${encodeURIComponent(id)}`;

/** Good morning, afternoon or evening where the workspace is. */
async function Greeting() {
  await connection();
  const me = await getMe().catch(orNull);
  const timeZone = me?.workspace.timeZone ?? 'UTC';
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone,
    }).format(new Date()),
  );
  return hour < 12
    ? 'Good morning'
    : hour < 18
      ? 'Good afternoon'
      : 'Good evening';
}

/**
 * What needs you across every client (attention items and drafts waiting
 * for a decision), when Dossier last read the tools, and what's up for
 * renewal soonest. With `grow`, it fills the column beside the list.
 */
function AcrossClients({ view, grow }: { view: TodayView; grow: boolean }) {
  const total = view.attention + view.drafts;
  const parts = [
    view.attention > 0 &&
      (view.attention === 1
        ? '1 needs attention'
        : `${view.attention} need attention`),
    view.drafts > 0 &&
      (view.drafts === 1
        ? '1 draft to review'
        : `${view.drafts} drafts to review`),
  ].filter(Boolean);
  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-5 overflow-hidden rounded-2xl bg-linear-to-br from-lilac-mist to-lilac-soft p-4',
        grow && 'lg:min-h-0 lg:flex-1',
      )}
    >
      <FieldPattern rows={4} cols={26} className="w-full text-lilac-deep" />
      <div>
        <p className="text-small text-muted">Across your clients</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-h1 leading-none">{total}</span>
          <span className="text-small text-muted">
            {total === 1 ? 'thing needs you' : 'things need you'}
          </span>
        </p>
        {parts.length > 0 && (
          <p className="mt-1.5 text-small">{parts.join(' · ')}</p>
        )}
        {view.lastRead && (
          <p className="mt-2 text-[0.75rem] text-muted">
            Dossier last read your tools {view.lastRead}.
          </p>
        )}
        {view.renewals.length > 0 && (
          <ul
            aria-label="Up for renewal soonest"
            className="mt-4 flex flex-col gap-2 text-small"
          >
            {view.renewals.map((renewal) => (
              <li
                key={`${renewal.clientId}-${renewal.what}`}
                className="flex justify-between gap-4"
              >
                <span>
                  {renewal.name} · {renewal.what}
                </span>
                <span className="shrink-0 text-muted">{renewal.when}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * One client that needs you: the most urgent few things its Overview lists,
 * and the way into its file for the rest.
 */
function ClientGroup({ group }: { group: TodayGroup }) {
  const href = clientHref(group.clientId);
  const heading = `needs-${group.clientId}`;
  return (
    <section aria-labelledby={heading}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1.5 pb-2.5">
        <h2
          id={heading}
          className="font-sans text-small font-medium tracking-normal"
        >
          {group.clientName}
        </h2>
        <p className="text-[0.75rem] text-muted">
          {[
            group.total > 0 &&
              (group.total === 1
                ? '1 needs attention'
                : `${group.total} need attention`),
            group.drafts > 0 &&
              (group.drafts === 1 ? '1 draft' : `${group.drafts} drafts`),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {group.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-white px-4 py-3"
          >
            <div className="min-w-[14rem] flex-1">
              <p className="font-medium">
                {item.title}
                {item.cite !== null && (
                  <sup className="ml-1 font-mono text-[0.625rem] text-lilac-ink">
                    {item.cite}
                  </sup>
                )}
              </p>
              <p className="text-small text-muted">{item.detail}</p>
            </div>
            <Tag tone={item.status.tone}>{item.status.label}</Tag>
            <p className="text-small text-muted sm:w-20 sm:text-right">
              {item.source ? (
                <a
                  href={item.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm underline decoration-ink/20 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink"
                >
                  {item.source.name}
                </a>
              ) : (
                'Dossier'
              )}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 px-1.5 pt-3">
        <ButtonLink href={href} variant="ink" size="sm">
          Open {group.clientName}
        </ButtonLink>
        {group.drafts > 0 && (
          <ButtonLink href={`${href}#draft`} variant="outline" size="sm">
            {group.drafts === 1
              ? 'Review the draft'
              : `Review ${group.drafts} drafts`}
          </ButtonLink>
        )}
        {group.total + group.drafts > group.items.length && (
          <p className="ml-1 text-small text-muted">
            {group.total + group.drafts - group.items.length} more in the file
          </p>
        )}
      </div>
    </section>
  );
}
