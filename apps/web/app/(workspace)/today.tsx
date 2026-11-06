import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { FieldPattern } from '@/components/brand/field-pattern';
import { IndexPattern } from '@/components/brand/index-pattern';
import { FirstName } from '@/components/shell/first-name';
import { TopBar } from '@/components/shell/top-bar';
import { ButtonLink } from '@/components/ui/button';
import { Folder } from '@/components/ui/folder';
import { Tag } from '@/components/ui/tag';
import { getMe } from '@/lib/data/auth';
import { orNull } from '@/lib/data/safe';
import type { Client, Workspace } from '@/lib/workspace';

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

/** Home on a working day: what needs you, what's coming, and your clients. */
export function Today({
  workspace,
  fathomConnected,
}: {
  workspace: Workspace;
  fathomConnected: boolean;
}) {
  const clients = new Map(
    workspace.clients.map((client) => [client.id, client]),
  );
  const needing = workspace.clients.filter(
    (client) => client.status === 'attention',
  ).length;
  const focusClient = workspace.focus
    ? clients.get(workspace.focus.clientId)
    : undefined;

  return (
    <>
      <TopBar title="Today" />
      <section className="mt-8">
        <h1 className="text-h1">
          <Suspense fallback="Hello">
            <Greeting />
          </Suspense>
          <FirstName />.
          <br />
          {needYou(needing)}
        </h1>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          {workspace.focus && focusClient ? (
            <Folder
              tone="act"
              tab={`Needs attention · ${workspace.focus.items.length}`}
              padded={false}
              bodyClassName="p-2.5"
            >
              <ul className="flex flex-col gap-2">
                {workspace.focus.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-white px-4 py-3"
                  >
                    <div className="min-w-[14rem] flex-1">
                      <p className="font-medium">
                        {item.title}
                        <sup className="ml-1 font-mono text-[0.625rem] text-lilac-ink">
                          {item.cite}
                        </sup>
                      </p>
                      <p className="text-small text-muted">{item.detail}</p>
                    </div>
                    <Tag tone={item.status.tone}>{item.status.label}</Tag>
                    <p className="text-small text-muted sm:w-20 sm:text-right">
                      {item.source}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3 px-1.5 pt-4 pb-1.5">
                <ButtonLink href={`/clients/${focusClient.id}`} variant="ink">
                  Open {focusClient.name}
                </ButtonLink>
                <ButtonLink
                  href={`/clients/${focusClient.id}#draft`}
                  variant="outline"
                >
                  Review the draft
                </ButtonLink>
              </div>
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

          <ThisWeek workspace={workspace} clients={clients} />
        </div>

        <div className="mt-10 flex items-baseline justify-between gap-4">
          <h2 className="font-sans text-small font-normal tracking-normal text-muted">
            Your clients
          </h2>
          <Link
            href="/clients"
            className="rounded-sm text-small text-ink underline-offset-[3px] hover:underline"
          >
            All {workspace.clients.length} →
          </Link>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {workspace.pinnedClientIds
            .map((id) => clients.get(id))
            .filter((client): client is Client => client !== undefined)
            .map((client) => (
              <li key={client.id}>
                <Link
                  href={`/clients/${client.id}`}
                  className="group block rounded-xl"
                >
                  <Folder
                    tone={client.tone}
                    bodyClassName="flex min-h-28 flex-col justify-between transition-colors group-hover:bg-grey-3"
                  >
                    <p className="text-base">{client.name}</p>
                    <p className="text-small text-muted">{client.summary}</p>
                  </Folder>
                </Link>
              </li>
            ))}
        </ul>

        {!fathomConnected && <FathomBanner />}
      </section>
    </>
  );
}

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

/** How much Dossier read this week, and what's up for renewal soonest. */
function ThisWeek({
  workspace,
  clients,
}: {
  workspace: Workspace;
  clients: Map<string, Client>;
}) {
  return (
    <div className="flex flex-col justify-between gap-6 overflow-hidden rounded-2xl bg-linear-to-br from-lilac-mist to-lilac-soft p-4 lg:self-stretch">
      <FieldPattern rows={6} cols={26} className="w-full text-lilac-deep" />
      <div>
        <p className="text-small text-muted">This week</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-h1 leading-none">
            {workspace.signalsThisWeek}
          </span>
          <span className="text-small text-muted">signals read</span>
        </p>
        {workspace.renewals.length > 0 && (
          <ul
            aria-label="Up for renewal soonest"
            className="mt-5 flex flex-col gap-2.5 text-small"
          >
            {workspace.renewals.map((renewal) => (
              <li
                key={`${renewal.clientId}-${renewal.what}`}
                className="flex justify-between gap-4"
              >
                <span>
                  {clients.get(renewal.clientId)?.name} · {renewal.what}
                </span>
                <span className="text-muted">{renewal.inDays} days</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Until Fathom is connected: promises from calls are what's missing. */
function FathomBanner() {
  return (
    <div className="relative isolate mt-8 overflow-hidden rounded-3xl bg-linear-to-br from-lime from-40% to-lime-soft px-6 py-6 sm:px-8">
      <div className="relative max-w-lg">
        <p className="font-display text-h2">
          Connect Fathom and every promise you make on a call lands in the file.
        </p>
        <ButtonLink href="/connections/fathom" variant="ink" className="mt-5">
          Connect Fathom
        </ButtonLink>
      </div>
      <IndexPattern
        rows={3}
        cols={6}
        accents={[
          [1, 1],
          [2, 4],
        ]}
        accentClassName="text-ink"
        className="pointer-events-none absolute top-1/2 right-6 -z-10 hidden h-[85%] w-auto -translate-y-1/2 text-ink/10 md:block"
      />
    </div>
  );
}
