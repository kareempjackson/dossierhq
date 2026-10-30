'use server';

import {
  eventTypeSchema,
  notificationChannelSchema,
  type EventType,
  type NotificationChannel,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import * as data from '@/lib/data';
import type { ActionResult } from './actions';

const unavailable =
  'Couldn’t save that. Check the API is running and try again.';

const ids = z.array(z.string().min(1).max(100)).min(1).max(100);
/** A page of the web app, never somewhere else. */
const inAppPath = z
  .string()
  .max(500)
  .regex(/^\/(?![/\\])/);

async function mark(which: string[] | 'all'): Promise<ActionResult> {
  try {
    const result = await data.markNotificationsRead(which);
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

export async function markNotificationsRead(
  notificationIds: string[],
): Promise<ActionResult> {
  const parsed = ids.safeParse(notificationIds);
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a valid change.' };
  return mark(parsed.data);
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return mark('all');
}

/** Marks one read and opens the page it's about. */
export async function openNotification(
  id: string,
  link: string,
): Promise<ActionResult> {
  const parsed = z.object({ id: ids.element, link: inAppPath }).safeParse({
    id,
    link,
  });
  if (!parsed.success) return { ok: false, error: 'That isn’t a valid link.' };
  // Opening it matters more than marking it, so a failed mark doesn't stop it.
  await mark([parsed.data.id]);
  redirect(parsed.data.link);
}

/** Turns one channel on or off for one kind of event. */
export async function setNotificationChannel(
  type: EventType,
  channel: NotificationChannel,
  on: boolean,
): Promise<ActionResult> {
  const parsed = z
    .object({
      type: eventTypeSchema,
      channel: notificationChannelSchema,
      on: z.boolean(),
    })
    .safeParse({ type, channel, on });
  if (!parsed.success)
    return { ok: false, error: 'That isn’t a valid change.' };
  try {
    await data.saveNotificationPreferences({
      [parsed.data.type]: { [parsed.data.channel]: parsed.data.on },
    });
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}
