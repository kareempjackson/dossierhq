import 'server-only';
import {
  inviteSchema,
  listOf,
  memberSchema,
  type Invite,
  type InviteCreate,
  type Member,
  type WorkspaceRole,
} from '@dossierhq/contracts';
import { cache } from 'react';
import { apiGet, apiSend } from '../api';
import { refused } from './refused';

/**
 * Who's in the workspace and who's been invited, through the API. Everyone
 * sees the members; only owners and admins see and send invites.
 */

type Refused = { ok: false; problem: string };

/** Everyone in the workspace, by name. */
export const getMembers = cache(
  async (): Promise<Member[]> =>
    (await apiGet('/members', listOf(memberSchema))).data,
);

/** Invites not yet accepted, newest first. Owners and admins only. */
export const getInvites = cache(
  async (): Promise<Invite[]> =>
    (await apiGet('/members/invites', listOf(inviteSchema))).data,
);

/** Emails someone a link to join; inviting an address again replaces it. */
export async function invite(
  request: InviteCreate,
): Promise<{ ok: true; invite: Invite } | Refused> {
  try {
    return {
      ok: true,
      invite: await apiSend('POST', '/members/invites', request, inviteSchema),
    };
  } catch (error) {
    return refused(error);
  }
}

/** Changes someone's role. Only owners touch owners; the last owner stays. */
export async function setMemberRole(
  userId: string,
  role: WorkspaceRole,
): Promise<{ ok: true; member: Member } | Refused> {
  try {
    return {
      ok: true,
      member: await apiSend(
        'PATCH',
        `/members/${encodeURIComponent(userId)}`,
        { role },
        memberSchema,
      ),
    };
  } catch (error) {
    return refused(error);
  }
}

/** Removes someone from the workspace, with their account and sessions. */
export async function removeMember(
  userId: string,
): Promise<{ ok: true } | Refused> {
  try {
    await apiSend('DELETE', `/members/${encodeURIComponent(userId)}`);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}

/** Withdraws an invite, so its link stops working. */
export async function withdrawInvite(
  id: string,
): Promise<{ ok: true } | Refused> {
  try {
    await apiSend('DELETE', `/members/invites/${encodeURIComponent(id)}`);
    return { ok: true };
  } catch (error) {
    return refused(error);
  }
}
