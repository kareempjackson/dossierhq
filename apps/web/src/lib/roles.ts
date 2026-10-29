import type { WorkspaceRole } from '@dossierhq/contracts';

export const ROLE_NAMES: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  technician: 'Technician',
};
