import {
  hasRole,
  PRICES_AS_OF,
  PRICING_URL,
  type IntelligenceKind,
  type IntelligenceSpend,
} from '@dossierhq/contracts';
import Link from 'next/link';
import { Suspense } from 'react';
import { ModelPicker } from '@/components/intelligence/model-picker';
import { People } from '@/components/settings/people';
import { YourSignIn } from '@/components/settings/your-sign-in';
import { SectionHeader } from '@/components/ui/section-header';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingLabel, Skeleton } from '@/components/ui/states';
import {
  getIntelligence,
  getInvites,
  getMe,
  getMembers,
  getNow,
  getSessions,
  getTwoFactor,
} from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { formatCalendarDate, formatDollars } from '@/lib/format';

export const metadata = { title: 'Settings' };

const KIND_NAMES: Record<IntelligenceKind, string> = {
  recommendations: 'Recommendations',
  ask: 'Questions asked',
  meetings: 'Meeting notes',
  reports: 'Weekly reports',
  patterns: 'Patterns across clients',
};

export default function SettingsPage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-220 flex-col gap-12">
        <header>
          <h1 className="text-title-compact sm:text-title">Settings</h1>
          <p className="mt-3 max-w-2xl text-text">
            Your sign-in, who is in your workspace, the Claude model Dossier
            drafts with, and what drafting has cost. What it drafts, and what
            Claude may read, are on the{' '}
            <Link href="/intelligence" className="underline underline-offset-2">
              Intelligence
            </Link>{' '}
            page.
          </p>
        </header>

        <Suspense fallback={<SettingsSkeleton what="your sign-in" />}>
          <SignInSettings />
        </Suspense>

        <Suspense
          fallback={<SettingsSkeleton what="the people in your workspace" />}
        >
          <PeopleSettings />
        </Suspense>

        <Suspense fallback={<SettingsSkeleton what="drafting settings" />}>
          <ModelSettings />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function SignInSettings() {
  const [me, sessions, twoFactor] = await Promise.all([
    getMe().catch(orNull),
    getSessions().catch(orNull),
    getTwoFactor().catch(orNull),
  ]);
  if (me === null || sessions === null || twoFactor === null) {
    return <ErrorState what="your sign-in" />;
  }
  return (
    <YourSignIn
      sessions={sessions}
      twoFactor={twoFactor}
      email={me.user.email}
      timeZone={me.workspace.timeZone}
    />
  );
}

async function PeopleSettings() {
  const [me, members, now] = await Promise.all([
    getMe().catch(orNull),
    getMembers().catch(orNull),
    getNow(),
  ]);
  if (me === null || members === null) {
    return <ErrorState what="the people in your workspace" />;
  }
  const manages = hasRole(me.role, 'admin');
  const invites = manages ? ((await getInvites().catch(orNull)) ?? []) : null;
  return (
    <People
      members={members}
      invites={invites}
      me={{ id: me.user.id, role: me.role }}
      now={now}
      timeZone={me.workspace.timeZone}
    />
  );
}

async function ModelSettings() {
  const [settings, me] = await Promise.all([
    getIntelligence().catch(orNull),
    getMe().catch(orNull),
  ]);
  if (settings === null) return <ErrorState what="the drafting settings" />;

  return (
    <>
      <section aria-labelledby="model" className="flex flex-col gap-4">
        <SectionHeader
          id="model"
          title="AI model"
          note={
            <>
              Anthropic’s prices as of {formatCalendarDate(PRICES_AS_OF)} ·{' '}
              <a
                href={PRICING_URL}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                current prices
              </a>
            </>
          }
        />
        {!settings.enabled && (
          <p
            role="status"
            className="rounded-card bg-marker-highlight px-4 py-3 text-body text-ink"
          >
            Drafting is off. Set ANTHROPIC_API_KEY on the API and restart it to
            turn it on.
          </p>
        )}
        <ModelPicker
          model={settings.model}
          defaultModel={settings.defaultModel}
          typicalRun={settings.typicalRun}
          canManage={hasRole(me?.role, 'admin')}
        />
        <p className="text-meta text-muted">
          Each model keeps its own cache of what it has read, so the first
          drafts after a switch cost a little more.
        </p>
      </section>

      <section aria-labelledby="spend" className="flex flex-col gap-4">
        <SectionHeader id="spend" title="Spend" note="Last 30 days" />
        <SpendTable spend={settings.spend} />
      </section>
    </>
  );
}

function SpendTable({ spend }: { spend: IntelligenceSpend[] }) {
  if (spend.length === 0) {
    return (
      <p className="rounded-card bg-sheet px-4 py-4 text-body text-muted shadow-card">
        Nothing drafted in the last 30 days.
      </p>
    );
  }
  const read = (row: IntelligenceSpend) =>
    row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
  const total = spend.reduce((sum, row) => sum + row.cost, 0);
  const number = new Intl.NumberFormat('en-GB');
  return (
    <div className="overflow-x-auto rounded-card bg-sheet shadow-card">
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-hairline text-left text-meta text-muted">
            <th className="px-4 py-2 font-medium">What</th>
            <th className="px-4 py-2 text-right font-medium">Runs</th>
            <th className="px-4 py-2 text-right font-medium">Tokens read</th>
            <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
              From cache
            </th>
            <th className="px-4 py-2 text-right font-medium">Tokens written</th>
            <th className="px-4 py-2 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline tabular-nums">
          {spend.map((row) => (
            <tr key={row.kind}>
              <td className="px-4 py-2 text-ink">{KIND_NAMES[row.kind]}</td>
              <td className="px-4 py-2 text-right">
                {number.format(row.runs)}
              </td>
              <td className="px-4 py-2 text-right">
                {number.format(read(row))}
              </td>
              <td className="hidden px-4 py-2 text-right sm:table-cell">
                {read(row) === 0
                  ? '–'
                  : `${Math.round((row.cacheReadTokens / read(row)) * 100)}%`}
              </td>
              <td className="px-4 py-2 text-right">
                {number.format(row.outputTokens)}
              </td>
              <td className="px-4 py-2 text-right text-ink">
                {formatDollars(row.cost)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-hairline">
            <td className="px-4 py-2 font-medium text-ink" colSpan={5}>
              Total
            </td>
            <td className="px-4 py-2 text-right font-medium text-ink tabular-nums">
              {formatDollars(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SettingsSkeleton({ what }: { what: string }) {
  return (
    <div>
      <LoadingLabel what={what} />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((card) => (
          <div
            key={card}
            className="flex flex-col gap-3 rounded-card bg-sheet p-4 shadow-card"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56 max-w-full" />
            <Skeleton className="h-10 w-full rounded-input" />
          </div>
        ))}
      </div>
    </div>
  );
}
