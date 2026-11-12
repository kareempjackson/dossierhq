'use server';

import {
  eventTypeSchema,
  intelligenceKeyUpdateSchema,
  inviteRoleSchema,
  modelIdSchema,
  notificationChannelSchema,
  providerIdSchema,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import * as data from '@/lib/data/auth';
import * as intelligence from '@/lib/data/intelligence';
import * as members from '@/lib/data/members';
import * as notifications from '@/lib/data/notifications';

/**
 * Settings: your password and other sessions, what you hear about, who's
 * in the workspace, and the model and keys Dossier drafts with. Each change
 * checks what it's given, asks the API, words its no, and reads again.
 */

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

export type ActionResult = { ok: true } | { ok: false; error: string };

async function attempt(
  run: () => Promise<{ ok: true } | { ok: false; problem: string }>,
): Promise<ActionResult> {
  try {
    const result = await run();
    if (!result.ok) return { ok: false, error: result.problem };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: unavailable };
  }
  refresh();
  return { ok: true };
}

// Notifications -----------------------------------------------------------------

const channelChange = z.object({
  type: eventTypeSchema,
  channel: notificationChannelSchema,
  on: z.boolean(),
});

/** Turns one channel on or off for one kind of event, for you alone. */
export async function setNotificationChannel(
  type: string,
  channel: string,
  on: boolean,
): Promise<ActionResult> {
  const parsed = channelChange.safeParse({ type, channel, on });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'That isn’t something Dossier tells you about.',
    };
  }
  return attempt(() =>
    notifications.saveNotificationPreferences({
      [parsed.data.type]: { [parsed.data.channel]: parsed.data.on },
    }),
  );
}

// People ------------------------------------------------------------------------

const newInvite = z.object({
  email: z.email('Enter an email address, like name@yourmsp.com.'),
  role: inviteRoleSchema,
});

/** Emails someone a link to join the workspace as an admin or technician. */
export async function inviteMember(
  email: string,
  role: string,
): Promise<ActionResult> {
  const parsed = newInvite.safeParse({
    email: email.trim().toLowerCase(),
    role,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? 'Check the email address and role.',
    };
  }
  return attempt(() => members.invite(parsed.data));
}

/** Withdraws an invite, so its link stops working. */
export async function withdrawInvite(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'That invite has already gone.' };
  return attempt(() => members.withdrawInvite(id));
}

// AI model and keys ---------------------------------------------------------------

/** Chooses the model Dossier drafts with; null follows the default. */
export async function chooseModel(model: string | null): Promise<ActionResult> {
  const parsed = modelIdSchema.nullable().safeParse(model);
  if (!parsed.success) {
    return { ok: false, error: 'That isn’t a model Dossier offers.' };
  }
  return attempt(() => intelligence.chooseModel(parsed.data));
}

export type KeyFormState = { error?: string; saved?: boolean };

/** Checks a provider's API key with the provider, then keeps it. */
export async function saveApiKey(
  _previous: KeyFormState,
  formData: FormData,
): Promise<KeyFormState> {
  const provider = providerIdSchema.safeParse(formData.get('provider'));
  if (!provider.success) {
    return { error: 'Dossier doesn’t draft with that provider.' };
  }
  const key = intelligenceKeyUpdateSchema.safeParse({
    key: String(formData.get('key') ?? ''),
  });
  if (!key.success) {
    return { error: key.error.issues[0]?.message ?? 'That isn’t an API key.' };
  }
  const result = await attempt(() =>
    intelligence.saveKey(provider.data, key.data.key),
  );
  return result.ok ? { saved: true } : { error: result.error };
}

/** Forgets the workspace's key for a provider. */
export async function removeApiKey(provider: string): Promise<ActionResult> {
  const parsed = providerIdSchema.safeParse(provider);
  if (!parsed.success) {
    return { ok: false, error: 'Dossier doesn’t draft with that provider.' };
  }
  return attempt(() => intelligence.removeKey(parsed.data));
}

// Your account --------------------------------------------------------------------

export type PasswordLinkState = { error?: string; sentTo?: string };

/**
 * Emails the signed-in person a link to choose a new password; the API has
 * no other way to change one. Saving it signs them out everywhere else.
 */
export async function emailPasswordLink(): Promise<PasswordLinkState> {
  try {
    const me = await data.getMe();
    const result = await data.requestPasswordReset({ email: me.user.email });
    if (result.ok) return { sentTo: me.user.email };
    return {
      error:
        result.reason === 'limited'
          ? 'Dossier has sent you several links already. Use the newest, or wait an hour.'
          : unavailable,
    };
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
}

export type SignOutOthersState = { error?: string; done?: boolean };

/** Ends the person's sessions in every other browser and device. */
export async function signOutEverywhereElse(): Promise<SignOutOthersState> {
  try {
    await data.signOutOthers();
  } catch (error) {
    unstable_rethrow(error);
    return { error: unavailable };
  }
  refresh();
  return { done: true };
}
