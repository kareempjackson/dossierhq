import { hasRole } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { ReadFailed } from '@/components/clients/client-tab';
import { DeliverySettings } from '@/components/reports/delivery-settings';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getMe } from '@/lib/data/auth';
import { getReportSettings } from '@/lib/data/client-records';
import { getClientNames } from '@/lib/data/clients';
import { orNull } from '@/lib/data/safe';
import { calendarDay, dayIn } from '@/lib/format';

export const metadata: Metadata = { title: 'Report delivery' };

/** How weekly reports look in the client's inbox, and when they're drafted and sent. */
export default function DeliveryPage() {
  return (
    <Reveal
      fallback={
        <IndexLoader className="h-160 flex-1" label="Loading report delivery" />
      }
    >
      <Delivery />
    </Reveal>
  );
}

async function Delivery() {
  const [me, settings, names] = await Promise.all([
    getMe(),
    getReportSettings().catch(orNull),
    getClientNames().catch(orNull),
  ]);
  if (settings === null) return <ReadFailed what="how reports go out" />;
  const timeZone = me.workspace.timeZone;
  // The preview shows a real client's name, the first alphabetically.
  const clientName =
    [...(names?.values() ?? [])].sort((a, b) => a.localeCompare(b))[0] ??
    'Your client';
  return (
    <DeliverySettings
      settings={{
        senderName: settings.senderName,
        replyTo: settings.replyTo ?? '',
        colour: settings.brandColour,
        logo: settings.logo,
        draftAt: settings.draftAt,
        sendAt: settings.sendAt,
      }}
      workspaceName={me.workspace.name}
      timeZone={timeZone.replaceAll('_', ' ')}
      canManage={hasRole(me.role, 'admin')}
      sample={{ clientName, period: lastWeek(timeZone, new Date()) }}
    />
  );
}

/** Last Monday to Sunday in the workspace's zone: "26 Oct to 1 Nov". */
function lastWeek(timeZone: string, now: Date): string {
  const today = dayIn(now, timeZone);
  const date = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  const day = (offset: number) =>
    new Date(date.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const monday = day(-sinceMonday - 7);
  const sunday = day(-sinceMonday - 1);
  return `${calendarDay(monday, timeZone, now)} to ${calendarDay(sunday, timeZone, now)}`;
}
