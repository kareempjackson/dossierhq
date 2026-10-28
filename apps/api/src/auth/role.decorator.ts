import type { WorkspaceRole } from '@dossierhq/contracts';
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_ROLE = Symbol('requiredRole');

export type RoleRequirement = { least: WorkspaceRole; to: string };

/**
 * Lets a route through only for `least` and the roles above it; anyone else
 * gets 403 "Only owners and admins can <to>." AuthGuard checks it.
 */
export const RequireRole = (least: WorkspaceRole, to: string) =>
  SetMetadata(REQUIRED_ROLE, { least, to } satisfies RoleRequirement);
