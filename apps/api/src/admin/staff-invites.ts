import type { StaffInvite, StaffRole } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashToken } from '../auth/token-hash.js';
import type { StaffActor } from './staff-audit.js';

/** How long a staff invite's link works. */
export const STAFF_INVITE_DAYS = 7;

/**
 * Saves an invite to join the staff, replacing any to the same email, and
 * returns it with the link's token, which is never stored. Shared by the API
 * and the command line that invites the first member of staff.
 */
export async function createStaffInvite(
  db: DatabaseAdapter,
  {
    email,
    role,
    from,
  }: { email: string; role: StaffRole; from: StaffActor | null },
): Promise<{ invite: StaffInvite; token: string }> {
  // Like sessions, invites run on real time, never the pinned test clock.
  const now = new Date();
  const token = randomBytes(32).toString('base64url');
  const invite: StaffInvite = {
    id: `sinv-${randomUUID()}`,
    email: email.toLowerCase(),
    role,
    invitedBy: from?.name ?? 'Dossier',
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + STAFF_INVITE_DAYS * 86_400_000,
    ).toISOString(),
  };
  await db.staff.saveInvite({
    ...invite,
    tokenHash: hashToken(token),
    invitedByStaffId: from?.id ?? null,
  });
  return { invite, token };
}

/** The admin app's page for accepting an invite. */
export function staffInviteLink(adminUrl: string, token: string): string {
  const link = new URL('/invite', adminUrl);
  link.searchParams.set('token', token);
  return link.href;
}
