'use server';

import {
  inviteCreateSchema,
  workspaceRoleSchema,
  type InviteCreate,
} from '@dossierhq/contracts';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import * as data from '@/lib/data';
import type { ActionResult } from './actions';

const unavailable =
  'Couldn’t save that. Check the API is running and try again.';

/** Runs a change, turning the API's no into words, then refreshes the page. */
async function change(
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

/** Emails someone a link to join the workspace. */
export async function inviteMember(
  invite: InviteCreate,
): Promise<ActionResult> {
  const parsed = inviteCreateSchema.safeParse(invite);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the email and role.',
    };
  }
  return change(() => data.inviteMember(parsed.data));
}

export async function withdrawInvite(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'That isn’t an invite.' };
  return change(() => data.withdrawInvite(id));
}

export async function setMemberRole(
  userId: string,
  role: string,
): Promise<ActionResult> {
  const parsed = workspaceRoleSchema.safeParse(role);
  if (!userId || !parsed.success) {
    return { ok: false, error: 'That isn’t a role in Dossier.' };
  }
  return change(() => data.setMemberRole(userId, parsed.data));
}

export async function removeMember(userId: string): Promise<ActionResult> {
  if (!userId) return { ok: false, error: 'That isn’t a member.' };
  return change(() => data.removeMember(userId));
}
