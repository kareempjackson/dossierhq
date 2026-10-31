'use server';

import { workspaceSuspendSchema } from '@dossierhq/contracts';
import { redirect } from 'next/navigation';
import { attempt, type ActionResult } from '@/lib/attempt';
import * as data from '@/lib/data';

export async function suspendWorkspace(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const parsed = workspaceSuspendSchema.safeParse({ reason });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Say why.' };
  }
  return attempt(() => data.suspendWorkspace(id, parsed.data.reason));
}

export async function restoreWorkspace(id: string): Promise<ActionResult> {
  return attempt(() => data.restoreWorkspace(id));
}

/** Deletes it, then goes back to the list: its page no longer exists. */
export async function deleteWorkspace(
  id: string,
  confirmName: string,
): Promise<ActionResult> {
  const result = await attempt(() => data.deleteWorkspace(id, confirmName));
  if (result.ok) redirect('/?deleted=1');
  return result;
}

export async function helpPerson(
  id: string,
  action: 'sign-out' | 'password-reset' | 'two-factor-off',
): Promise<ActionResult> {
  return attempt(() => data.helpPerson(id, action));
}
