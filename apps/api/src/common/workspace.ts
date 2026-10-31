import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** A member of Dossier's staff in a read-only support view. */
export type SupportView = {
  grantId: string;
  staffName: string;
  /** When the view ends. */
  endsAt: string;
};

/** Set by AuthGuard on every request that isn't @Public(). */
export type AuthenticatedRequest = Request & {
  auth?: {
    token: string;
    /** In a support view, the owner it acts as. */
    userId: string;
    workspaceId: string;
    /** Set when this is a support view, not the person themselves. */
    support?: SupportView;
  };
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

/** The support view this request comes from, or null for the person themselves. */
export const SupportViewOf = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SupportView | null =>
    auth(context).support ?? null,
);
