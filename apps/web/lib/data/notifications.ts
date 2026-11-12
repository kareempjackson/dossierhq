import 'server-only';
import {
  notificationSettingsSchema,
  type NotificationPreferencesUpdate,
  type NotificationSetting,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet, apiSend } from '../api';
import { refused } from './refused';

/**
 * What the signed-in person hears about, and how, through the API. Each
 * person chooses their own; the API lists only the events their role hears.
 */

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
