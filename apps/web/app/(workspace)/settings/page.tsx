import { hasRole, type Sessions } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { ReadFailed } from '@/components/clients/client-tab';
import {
  AccountSection,
  type BrowserSession,
} from '@/components/settings/account-section';
import { ApiKeys } from '@/components/settings/api-keys';
import { ModelPicker } from '@/components/settings/model-picker';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { PeopleSection } from '@/components/settings/people-section';
import { SettingsNav } from '@/components/settings/settings-nav';
import { SettingsSection } from '@/components/settings/settings-section';
import { Spend } from '@/components/settings/spend';
import { TopBar } from '@/components/shell/top-bar';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getMe, getSessions, getTwoFactor } from '@/lib/data/auth';
import { getIntelligence } from '@/lib/data/intelligence';
import { getInvites, getMembers } from '@/lib/data/members';
import { getNotificationSettings } from '@/lib/data/notifications';
import { orNull } from '@/lib/data/safe';
import {
  inviteRows,
  keyRows,
  memberRows,
  modelChoice,
  notificationGroups,
  spendView,
} from '@/lib/settings-views';

export const metadata: Metadata = { title: 'Settings' };

/**
 * One page of sections, with a menu that follows along. Each section's
 * heading is drawn at once and its contents arrive from the API on their
 * own; the model, keys and spend share one read.
 */
export default function SettingsPage() {
  return (
    <>
      <TopBar
        title="Settings"
        subtitle="Your account, people, AI model, keys and spend"
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <SettingsNav />
        <div className="flex min-w-0 flex-col gap-5">
          <Reveal
            fallback={
              <IndexLoader className="h-[25rem]" label="Loading your account" />
            }
          >
            <Account />
          </Reveal>
          <SettingsSection
            id="notifications"
            label="Notifications"
            title="What you hear about"
            intro="In your notifications and by email. These are yours; everyone in the workspace chooses their own."
          >
            <Reveal
              fallback={
                <IndexLoader
                  className="h-160"
                  label="Loading what you hear about"
                />
              }
            >
              <Notifications />
            </Reveal>
          </SettingsSection>
          <SettingsSection
            id="people"
            label="People"
            title="Who’s in the workspace"
            intro="Owners and admins manage connections, people and drafting. Technicians review reports and recommendations."
          >
            <Reveal
              fallback={
                <IndexLoader className="h-56" label="Loading who’s here" />
              }
            >
              <People />
            </Reveal>
          </SettingsSection>
          <SettingsSection
            id="ai-model"
            label="AI model"
            title="The model Dossier drafts with"
            intro="Claude, ChatGPT, Gemini or Grok. Each model keeps its own cache of what it has read, so the first drafts after a switch cost a little more."
          >
            <Reveal
              fallback={
                <IndexLoader className="h-200" label="Loading the models" />
              }
            >
              <Models />
            </Reveal>
          </SettingsSection>
          <SettingsSection
            id="api-keys"
            label="API keys"
            title="Your own keys"
            intro="Bring your own key from Anthropic, OpenAI, Google or xAI, and its models draft on your account, billed to you by the provider. Keys are checked before they’re kept, stored encrypted, and never shown again."
          >
            <Reveal
              fallback={
                <IndexLoader className="h-80" label="Loading your keys" />
              }
            >
              <Keys />
            </Reveal>
          </SettingsSection>
          <SettingsSection
            id="spend"
            label="Spend"
            title="The last 30 days"
            intro="What drafting has cost, at each provider’s list prices."
          >
            <Reveal
              fallback={
                <IndexLoader className="h-72" label="Loading what it cost" />
              }
            >
              <SpendPart />
            </Reveal>
          </SettingsSection>
        </div>
      </div>
    </>
  );
}

/** What you hear about, and how: yours alone. */
async function Notifications() {
  const settings = await getNotificationSettings().catch(orNull);
  if (settings === null) return <ReadFailed what="what you hear about" />;
  return <NotificationSettings groups={notificationGroups(settings)} />;
}

/** Everyone in the workspace, and, for owners and admins, who's invited. */
async function People() {
  // Invites are asked for alongside, as an admin would; anyone else is told
  // no, and sees none.
  const [me, members, invites] = await Promise.all([
    getMe(),
    getMembers().catch(orNull),
    getInvites().catch(orNull),
  ]);
  if (members === null) return <ReadFailed what="who’s in the workspace" />;
  const canManage = hasRole(me.role, 'admin');
  return (
    <PeopleSection
      members={memberRows(members, me.user.id)}
      invites={
        canManage
          ? inviteRows(invites ?? [], {
              timeZone: me.workspace.timeZone,
              now: new Date(),
            })
          : []
      }
      canManage={canManage}
    />
  );
}

async function Models() {
  const [me, settings] = await Promise.all([
    getMe(),
    getIntelligence().catch(orNull),
  ]);
  if (settings === null) return <ReadFailed what="the models" />;
  return (
    <ModelPicker
      choice={modelChoice(settings)}
      canManage={hasRole(me.role, 'admin')}
    />
  );
}

async function Keys() {
  const [me, settings] = await Promise.all([
    getMe(),
    getIntelligence().catch(orNull),
  ]);
  if (settings === null) return <ReadFailed what="your keys" />;
  return (
    <ApiKeys
      rows={keyRows(settings, {
        timeZone: me.workspace.timeZone,
        now: new Date(),
      })}
      canManage={hasRole(me.role, 'admin')}
      canStoreKeys={settings.canStoreKeys}
    />
  );
}

async function SpendPart() {
  const settings = await getIntelligence().catch(orNull);
  if (settings === null) return <ReadFailed what="what drafting cost" />;
  return <Spend spend={spendView(settings.spend)} />;
}

/** Your account's two-factor sign-in and this browser's session, from the API. */
async function Account() {
  const [me, twoFactor, sessions] = await Promise.all([
    getMe().catch(orNull),
    getTwoFactor().catch(orNull),
    getSessions().catch(orNull),
  ]);
  return (
    <AccountSection
      twoFactor={twoFactor}
      session={
        me && sessions ? describeSession(sessions, me.workspace.timeZone) : null
      }
    />
  );
}

/** "Signed in since 3 November", "after 3 days", "on 3 December at the latest". */
function describeSession(sessions: Sessions, timeZone: string): BrowserSession {
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone,
  });
  const { idleHours } = sessions;
  const days = idleHours / 24;
  return {
    since: day.format(new Date(sessions.current.createdAt)),
    latest: day.format(new Date(sessions.current.expiresAt)),
    idle: Number.isInteger(days)
      ? `${days} ${days === 1 ? 'day' : 'days'}`
      : `${idleHours} hours`,
    others: sessions.others,
  };
}
