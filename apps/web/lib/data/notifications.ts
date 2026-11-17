import 'server-only';
import {
  notificationCountSchema,
  notificationPageSchema,
  notificationReadResultSchema,
  notificationSettingsSchema,
  type NotificationPage,
  type NotificationPreferencesUpdate,
  type NotificationSetting,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet, apiSend, withQuery } from '../api';
import { refused } from './refused';

/**
 * The signed-in person's notifications, and what they hear about and how,
 * through the API. Everyone has their own; nobody sees anyone else's. The
 * API lists only the events their role hears about.
 */

/** A page of the feed, newest first; `before` is the API's `older` cursor. */
export const getNotifications = cache(
  async (
    view: 'all' | 'unread',
    before: string | undefined,
  ): Promise<NotificationPage> =>
    apiGet(
      withQuery('/notifications', {
        unread: view === 'unread' ? 'true' : undefined,
        before,
      }),
      notificationPageSchema,
    ),
);

/** How many are unread. */
export const getUnreadCount = cache(
  async (): Promise<number> =>
    (await apiGet('/notifications/count', notificationCountSchema)).unread,
);

/** Marks some read by ID, or every one. */
export async function markNotificationsRead(
  which: string[] | 'all',
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend(
      'POST',
      '/notifications/read',
      which === 'all' ? { all: true } : { ids: which },
      notificationReadResultSchema,
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Each event type they hear about, with their channels after defaults. */
export const getNotificationSettings = cache(
  async (): Promise<NotificationSetting[]> =>
    (await apiGet('/notifications/preferences', notificationSettingsSchema))
      .data,
);

/** Changes some event types' channels; the rest stay as they are. */
export async function saveNotificationPreferences(
  update: NotificationPreferencesUpdate,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  try {
    await apiSend(
      'PUT',
      '/notifications/preferences',
      update,
      notificationSettingsSchema,
    );
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
