'use server';

import {
  staffInviteCreateSchema,
  staffRoleSchema,
  type StaffRole,
} from '@dossierhq/contracts';
import { attempt, UNAVAILABLE, type ActionResult } from '@/lib/attempt';
import * as data from '@/lib/data';

export async function inviteStaff(
  email: string,
  role: StaffRole,
): Promise<ActionResult> {
  const parsed = staffInviteCreateSchema.safeParse({ email, role });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? UNAVAILABLE };
  }
  return attempt(() => data.inviteStaff(parsed.data));
}

export async function withdrawStaffInvite(id: string): Promise<ActionResult> {
  return attempt(() => data.withdrawStaffInvite(id));
}

export async function setStaffRole(
  id: string,
  role: StaffRole,
): Promise<ActionResult> {
  const parsed = staffRoleSchema.safeParse(role);
  if (!parsed.success) return { ok: false, error: 'Choose a role.' };
  return attempt(() => data.setStaffRole(id, parsed.data));
}

export async function disableStaff(id: string): Promise<ActionResult> {
  return attempt(() => data.disableStaff(id));
}
