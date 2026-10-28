import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Set by AuthGuard on every request that isn't @Public(). */
export type AuthenticatedRequest = Request & {
  auth?: { token: string; userId: string; workspaceId: string };
  /** The visitor's trusted address, or null; see trustedClientIp. */
  clientIp?: string | null;
};

function auth(context: ExecutionContext) {
  const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!auth) throw new Error('AuthGuard did not run for this route');
  return auth;
}

/** The workspace the signed-in session acts on. */
export const WorkspaceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    auth(context).workspaceId,
);

/** The signed-in user's ID. */
export const UserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => auth(context).userId,
);

/** The bearer token of the current session, for signing out. */
export const SessionToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => auth(context).token,
);
