import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../common/workspace.js';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * Runs on every request. Requires `Authorization: Bearer <token>` for a live
 * session, then pins the request to that session's user and workspace.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Sign in to continue');

    const session = await this.auth.authenticate(token);
    if (!session) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    request.auth = {
      token,
      userId: session.userId,
      workspaceId: session.workspaceId,
    };
    return true;
  }
}
