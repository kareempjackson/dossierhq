import { getMe } from '@/lib/data/auth';
import { getClientList, getClientNames } from '@/lib/data/clients';
import { getUnreadCount } from '@/lib/data/notifications';
import { getOutbox, getReportQueue } from '@/lib/data/reports';
import { orNull } from '@/lib/data/safe';
import { paletteData } from '@/lib/today-views';
import { PaletteSync, UnreadSync } from './shell-sync';

/**
 * What every workspace page's chrome reads from the API, each inside its
 * own Suspense in the workspace layout so the page never waits for it. If
 * the API can't say, the chrome keeps what it had.
 */

/** The bell's badge: how many notifications are unread. */
export async function UnreadCount() {
  const unread = await getUnreadCount().catch(orNull);
  return unread === null ? null : <UnreadSync unread={unread} />;
}

/** The clients and reports the command palette jumps to. */
export async function PaletteData() {
  const [me, clients, queue, outbox, names] = await Promise.all([
    getMe().catch(orNull),
    getClientList().catch(orNull),
    getReportQueue().catch(orNull),
    getOutbox().catch(orNull),
    getClientNames().catch(orNull),
  ]);
  if (!me || !clients) return null;
  return (
    <PaletteSync
      palette={paletteData(
        {
          clients,
          queue: queue ?? [],
          outbox: outbox ?? [],
          names: names ?? new Map(),
        },
        { timeZone: me.workspace.timeZone, now: new Date() },
      )}
    />
  );
}
