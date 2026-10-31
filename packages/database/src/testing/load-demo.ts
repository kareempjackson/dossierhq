import { demo, toInsertSql } from '@dossierhq/fixtures';
import postgres from 'postgres';

/** Workspaces and users the contract suite creates for write tests start with this. */
export const SCRATCH_PREFIX = 'contract-scratch-';

/**
 * Loads the demo workspace into a real database for the contract suite, and
 * returns a function that removes it (and any scratch workspaces and users)
 * again, so the tests leave a developer's own data alone. Every row hangs off
 * a workspace or a user, so deleting those cascades to the rest; scratch
 * staff, their invites and their log go by ID.
 */
export async function loadDemoWorkspace(
  databaseUrl: string,
): Promise<() => Promise<void>> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const remove = async () => {
    await sql`
      delete from workspaces
      where id = ${demo.workspace.id} or id like ${`${SCRATCH_PREFIX}%`}
    `;
    await sql`
      delete from users
      where id in ${sql(demo.users.map((u) => u.id))}
        or id like ${`${SCRATCH_PREFIX}%`}
    `;
    for (const table of ['staff_audit', 'staff_invites', 'staff_users']) {
      await sql`delete from ${sql(table)} where id like ${`${SCRATCH_PREFIX}%`}`;
    }
  };
  try {
    await remove();
    await sql.unsafe(toInsertSql(demo));
  } catch (error) {
    await sql.end();
    throw error;
  }
  return async () => {
    try {
      await remove();
    } finally {
      await sql.end();
    }
  };
}
