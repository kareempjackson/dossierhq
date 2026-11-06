'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data/auth';

/** Settings → Account: your password and your other sessions. */

const unavailable =
  'Dossier can’t reach its server right now. Try again shortly.';

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
