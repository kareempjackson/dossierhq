import { hasRole, type WorkspaceRole } from '@dossierhq/contracts';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { trustedClientIp } from '../common/client-ip.js';
import { IS_STAFF } from '../admin/staff.decorator.js';
import type { AppConfig } from '../config/configuration.js';
import type { AuthenticatedRequest } from '../common/workspace.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC } from './public.decorator.js';
import { REQUIRED_ROLE, type RoleRequirement } from './role.decorator.js';
import { SupportAccess, isSupportToken } from './support-access.service.js';
import { NO_SUPPORT, SUPPORT_ALLOWED } from './support.decorator.js';

/** What a support view may do: read. */
const READS = new Set(['GET', 'HEAD']);

/**
 * Runs on every request. Requires `Authorization: Bearer <token>` for a live
 * session, then pins the request to that session's user and workspace, and
 * checks the role a route asks for with @RequireRole(). Notes the visitor's
 * trusted address first, on public routes too. Leaves @Staff() routes to
 * StaffGuard. A support view's token (`sup.…`) acts as the workspace's owner,
 * and may only read.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly clientIpKey: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly support: SupportAccess,
    config: ConfigService<AppConfig, true>,
  ) {
    this.clientIpKey = config.get('CLIENT_IP_KEY', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.clientIp = trustedClientIp(request.headers, this.clientIpKey);

    const targets = [context.getHandler(), context.getClass()];
    // Staff routes are StaffGuard's; a workspace session never opens them.
    if (this.reflector.getAllAndOverride<boolean>(IS_STAFF, targets)) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Sign in to continue');

    if (isSupportToken(token)) {
      const view = await this.support.authenticate(token);
      if (!view) {
        throw new UnauthorizedException('This support view has ended.');
      }
      request.auth = { token, ...view };
      // Read-only, and never the owner's own account.
      const allowed = this.reflector.getAllAndOverride<boolean>(
        SUPPORT_ALLOWED,
        targets,
      );
      const refused = this.reflector.getAllAndOverride<boolean>(
        NO_SUPPORT,
        targets,
      );
      if (refused || (!allowed && !READS.has(request.method))) {
        throw new ForbiddenException('Support access is read-only.');
      }
    } else {
      const session = await this.auth.authenticate(token);
      if (!session) {
        throw new UnauthorizedException(
          'Your session has ended. Sign in again.',
        );
      }
      request.auth = {
        token,
        userId: session.userId,
        workspaceId: session.workspaceId,
      };
    }
    const { userId, workspaceId } = request.auth;

    const required = this.reflector.getAllAndOverride<
      RoleRequirement | undefined
    >(REQUIRED_ROLE, targets);
    if (required) {
      // Read fresh each time, so a changed role applies at once.
      const role = await this.auth.roleOf(userId, workspaceId);
      if (!hasRole(role, required.least)) {
        throw new ForbiddenException(
          `Only ${WHO[required.least]} can ${required.to}.`,
        );
      }
    }
    return true;
  }
}

const WHO: Record<WorkspaceRole, string> = {
  owner: 'the workspace owner',
  admin: 'owners and admins',
  technician: 'members of this workspace',
};
