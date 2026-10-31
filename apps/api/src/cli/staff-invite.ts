/**
 * Invites someone to Dossier's staff and prints the link, for the first
 * member of staff (after that, admins invite from the admin app). Talks to
 * the database straight, without starting the API, so no sync or schedule
 * runs:
 *
 *   pnpm --filter @dossierhq/api staff:invite -- --email you@example.com
 *
 * `--role` is `admin` (the default) or `support`. The link opens ADMIN_URL's
 * invite page and works for 7 days.
 */
import { emailSchema, staffRoleSchema } from '@dossierhq/contracts';
import { createDatabase, databaseConfigFromEnv } from '@dossierhq/database';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  STAFF_INVITE_DAYS,
  createStaffInvite,
  staffInviteLink,
} from '../admin/staff-invites.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    role: { type: 'string', default: 'admin' },
  },
});

const email = emailSchema.safeParse(values.email ?? '');
const role = staffRoleSchema.safeParse(values.role);
const adminUrl = z
  .url()
  .default('http://localhost:3001')
  .safeParse(process.env.ADMIN_URL || undefined);
if (!email.success || !role.success || !adminUrl.success) {
  console.error(
    'Usage: staff:invite -- --email you@example.com [--role admin|support]\n' +
      (adminUrl.success ? '' : 'ADMIN_URL must be a URL.\n'),
  );
  process.exit(2);
}

const db = await createDatabase(databaseConfigFromEnv(process.env));
try {
  if (await db.staff.findByEmail(email.data)) {
    console.error(`${email.data} is already on the staff.`);
    process.exitCode = 1;
  } else {
    const { token } = await createStaffInvite(db, {
      email: email.data,
      role: role.data,
      from: null,
    });
    await db.staffAudit.append({
      id: `sau-${randomUUID()}`,
      at: new Date().toISOString(),
      staff: null,
      what: `Invited ${email.data} to the staff as ${role.data} from the command line`,
      workspaceId: null,
      userId: null,
      outcome: 'ok',
      ip: null,
    });
    console.log(
      [
        `Invited ${email.data} (${role.data}) on ${db.provider}.`,
        `Open this link within ${STAFF_INVITE_DAYS} days to join:`,
        '',
        staffInviteLink(adminUrl.data, token),
      ].join('\n'),
    );
  }
} finally {
  await db.close();
}
