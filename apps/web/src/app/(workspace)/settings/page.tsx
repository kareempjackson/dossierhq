import {
  hasRole,
  PRICES_AS_OF,
  PRICING_URL,
  type Me,
} from '@dossierhq/contracts';
import Link from 'next/link';
import { Suspense } from 'react';
import { ModelPicker } from '@/components/intelligence/model-picker';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { People } from '@/components/settings/people';
import {
  SettingsNav,
  type SettingsNavItem,
} from '@/components/settings/settings-nav';
import { SettingsSection } from '@/components/settings/settings-section';
import { Spend } from '@/components/settings/spend';
import { YourSignIn } from '@/components/settings/your-sign-in';
import { Avatar } from '@/components/ui/avatar';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingLabel, Skeleton } from '@/components/ui/states';
import {
  getIntelligence,
  getInvites,
  getMe,
  getMembers,
  getNotificationSettings,
  getNow,
  getSessions,
  getTwoFactor,
} from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { formatCalendarDate } from '@/lib/format';
import { ROLE_NAMES } from '@/lib/roles';

export const metadata = { title: 'Settings' };

const SECTIONS: SettingsNavItem[] = [
  { id: 'account', label: 'Your account', icon: 'account' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'people', label: 'People', icon: 'people' },
  { id: 'model', label: 'AI model', icon: 'model' },
  { id: 'spend', label: 'Spend', icon: 'spend' },
];

export default function SettingsPage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-260">
        <header className="max-w-2xl">
          <h1 className="text-title-compact sm:text-title">Settings</h1>
          <p className="mt-3 text-text">
            Your account, what Dossier tells you about, who is in your
            workspace, the Claude model Dossier drafts with, and what drafting
            has cost. What it drafts, and what Claude may read, are on the{' '}
            <Link href="/intelligence" className="underline underline-offset-2">
              Intelligence
            </Link>{' '}
            page.
          </p>
        </header>

        <div className="mt-8 xl:mt-12 xl:grid xl:grid-cols-[12rem_minmax(0,1fr)] xl:items-start xl:gap-12">
          <SettingsNav items={SECTIONS} />

          <div className="flex min-w-0 flex-col gap-14">
            <SettingsSection
              id="account"
              title="Your account"
              description="Who you are in Dossier, how you sign in, and where you’re signed in."
            >
              <Suspense
                fallback={<RowsSkeleton what="your sign-in" rows={4} lead />}
              >
                <AccountSettings />
              </Suspense>
            </SettingsSection>

            <SettingsSection
              id="notifications"
              title="Notifications"
              description="What you hear about, in your notifications and by email. These are yours; everyone in the workspace chooses their own."
            >
              <Suspense
                fallback={<RowsSkeleton what="your notifications" rows={4} />}
              >
                <NotificationPreferences />
              </Suspense>
            </SettingsSection>

            <SettingsSection
              id="people"
              title="People"
              description="Owners and admins manage connections, people and drafting. Technicians review reports and recommendations."
            >
              <Suspense
                fallback={
                  <RowsSkeleton what="the people in your workspace" rows={3} />
                }
              >
                <PeopleSettings />
              </Suspense>
            </SettingsSection>

            <SettingsSection
              id="model"
              title="AI model"
              description="The Claude model Dossier drafts with. Each model keeps its own cache of what it has read, so the first drafts after a switch cost a little more."
              aside={
                <>
                  Anthropic’s prices as of {formatCalendarDate(PRICES_AS_OF)} ·{' '}
                  <a
                    href={PRICING_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    current prices
                  </a>
                </>
              }
            >
              <Suspense fallback={<ModelsSkeleton />}>
                <ModelSettings />
              </Suspense>
            </SettingsSection>

            <SettingsSection
              id="spend"
              title="Spend"
              description="What drafting with Claude has cost in the last 30 days."
            >
              <Suspense fallback={<SpendSkeleton />}>
                <SpendSettings />
              </Suspense>
            </SettingsSection>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

async function AccountSettings() {
  const [me, sessions, twoFactor] = await Promise.all([
    getMe().catch(orNull),
    getSessions().catch(orNull),
    getTwoFactor().catch(orNull),
  ]);
  if (me === null || sessions === null || twoFactor === null) {
    return <ErrorState what="your sign-in" />;
  }
  return (
    <>
      <Profile me={me} />
      <YourSignIn
        sessions={sessions}
        twoFactor={twoFactor}
        email={me.user.email}
        timeZone={me.workspace.timeZone}
      />
    </>
  );
}

/** Who is signed in, and their place in the workspace. */
function Profile({ me }: { me: Me }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-sheet p-5 shadow-card">
      <Avatar name={me.user.name} size="lg" tone="deep" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-section font-semibold text-ink">
          {me.user.name}
        </p>
        <p className="truncate text-meta text-muted">
          {me.user.email}
          {me.user.title && ` · ${me.user.title}`}
        </p>
      </div>
      <p className="flex items-center gap-2 text-meta text-text">
        {me.workspace.name}
        <Pill tone="positive">{ROLE_NAMES[me.role]}</Pill>
      </p>
    </div>
  );
}

async function NotificationPreferences() {
  const settings = await getNotificationSettings().catch(orNull);
  if (settings === null) return <ErrorState what="your notifications" />;
  return <NotificationSettings settings={settings} />;
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
    </>
  );
}

async function SpendSettings() {
  const settings = await getIntelligence().catch(orNull);
  if (settings === null) return <ErrorState what="what drafting has cost" />;
  return <Spend spend={settings.spend} />;
}

/** A card of setting rows, optionally under a profile card. */
function RowsSkeleton({
  what,
  rows,
  lead = false,
}: {
  what: string;
  rows: number;
  /** A profile card above, as Your account has. */
  lead?: boolean;
}) {
  return (
    <>
      <LoadingLabel what={what} />
      {lead && (
        <div className="flex items-center gap-4 rounded-card bg-sheet p-5 shadow-card">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      )}
      <div className="divide-y divide-hairline rounded-card bg-sheet shadow-card">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="size-9 rounded-tile" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        ))}
      </div>
    </>
  );
}

function ModelsSkeleton() {
  return (
    <div className="@container">
      <LoadingLabel what="drafting settings" />
      <div className="grid gap-3 @xl:grid-cols-2">
        {[0, 1, 2, 3].map((card) => (
          <div
            key={card}
            className="flex flex-col gap-3 rounded-card bg-sheet p-5 shadow-card"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56 max-w-full" />
            <Skeleton className="mt-2 h-6 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SpendSkeleton() {
  return (
    <>
      <LoadingLabel what="what drafting has cost" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((tile) => (
          <div
            key={tile}
            className="flex flex-col gap-2 rounded-card bg-sheet p-4 shadow-card"
          >
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 rounded-card" />
    </>
  );
}
