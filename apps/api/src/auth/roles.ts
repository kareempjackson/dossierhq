import type { WorkspaceRole } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';

/**
 * The user's role in the workspace, or null if they aren't in it. Read fresh
 * each time, so a changed role applies at once.
 */
export async function roleIn(
  db: DatabaseAdapter,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceRole | null> {
  const memberships = await db.users.memberships(userId);
  return memberships.find((m) => m.workspaceId === workspaceId)?.role ?? null;
}
