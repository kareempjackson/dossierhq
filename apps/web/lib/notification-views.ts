import type { Notification } from '@dossierhq/contracts';
import type { When } from './client-views';
import { ago, fullTime } from './format';

/**
 * Notifications as the Notifications page shows them, in the workspace's
 * time zone. Pure: the page reads the API and passes the results in.
 */

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  /** e.g. "4 min ago", "yesterday", "27 Oct". */
  when: string;
  /** The full time, for a title attribute. */
  at: string;
  unread: boolean;
  /** A page in Dossier that shows or fixes it; null when there's none. */
  link: string | null;
};

/** Only paths inside Dossier: a notification never sends anyone away. */
const inApp = (link: string | null) =>
  link && /^\/(?![/\\])/.test(link) ? link : null;

export function notificationRows(
  notifications: Notification[],
  { timeZone, now }: When,
): NotificationRow[] {
  return notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    body: notification.body,
    when: ago(notification.at, now, timeZone),
    at: fullTime(notification.at, timeZone),
    unread: notification.readAt === null,
    link: inApp(notification.link),
  }));
}

export type NotificationView = 'all' | 'unread';

/** `/notifications`, or its Unread tab, from a page's first entry. */
export function notificationsHref(
  view: NotificationView,
  before?: string,
): string {
  const params = new URLSearchParams();
  if (view === 'unread') params.set('view', 'unread');
  if (before) params.set('before', before);
  const search = params.toString();
  return search ? `/notifications?${search}` : '/notifications';
}
