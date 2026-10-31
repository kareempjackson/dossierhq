import type { StaffRole } from '@dossierhq/contracts';
import {
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/workspace.js';

export const IS_STAFF = Symbol('isStaff');
export const STAFF_ROLE = Symbol('staffRole');

/** The header carrying ADMIN_API_KEY, proving a request came from the admin app. */
export const ADMIN_KEY_HEADER = 'x-dossier-admin-key';

export type StaffRequirement = { least: StaffRole; to: string };

/** Set by StaffGuard on every staff route that isn't @Public(). */
export type StaffRequest = AuthenticatedRequest & {
  staff?: {
    token: string;
    staffId: string;
    /** As the logs name them. */
    actor: { id: string; name: string; email: string };
  };
};

/**
 * Marks an admin controller: StaffGuard signs its requests in as staff, and
 * AuthGuard leaves them alone. A controller without it gets workspaces'
 * sign-in, which a staff session never passes, so forgetting it fails closed.
 */
export const Staff = () => SetMetadata(IS_STAFF, true);

/**
 * Lets a staff route through only for `least` and above; anyone else gets
 * 403 "Only admins can <to>." StaffGuard checks it.
 */
export const RequireStaffRole = (least: StaffRole, to: string) =>
  SetMetadata(STAFF_ROLE, { least, to } satisfies StaffRequirement);

function staff(context: ExecutionContext) {
  const { staff } = context.switchToHttp().getRequest<StaffRequest>();
  if (!staff) throw new Error('StaffGuard did not run for this route');
  return staff;
}

/** The signed-in member of staff's ID. */
export const StaffId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => staff(context).staffId,
);

/** The bearer token of the staff session, for signing out. */
export const StaffToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => staff(context).token,
);

/** The signed-in member of staff, as the logs name them. */
export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => staff(context).actor,
);
