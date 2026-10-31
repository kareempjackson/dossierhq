import { hasStaffRole } from '@dossierhq/contracts';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../auth/public.decorator.js';
import { sameSecret } from '../common/same-secret.js';
import type { AppConfig } from '../config/configuration.js';
import { StaffAuthService } from './staff-auth.service.js';
import {
  ADMIN_KEY_HEADER,
  IS_STAFF,
  STAFF_ROLE,
  type StaffRequest,
  type StaffRequirement,
} from './staff.decorator.js';

/**
 * Runs on every request, and acts only on @Staff() routes. Those need the
 * admin app's key first: without it, or with ADMIN_API_KEY unset, they
 * answer 404 like a route that doesn't exist. Then a live staff session,
 * unless the route is @Public(), and the role it asks for, read fresh.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  private readonly adminKey: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly staffAuth: StaffAuthService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.adminKey = config.get('ADMIN_API_KEY', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (!this.reflector.getAllAndOverride<boolean>(IS_STAFF, targets)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const given = request.headers[ADMIN_KEY_HEADER];
    if (
      !this.adminKey ||
      typeof given !== 'string' ||
      !sameSecret(given, this.adminKey)
    ) {
      throw new NotFoundException(`Cannot ${request.method} ${request.path}`);
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Sign in to continue');
    const staff = await this.staffAuth.authenticate(token);
    if (!staff) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    request.staff = {
      token,
      staffId: staff.id,
      actor: { id: staff.id, name: staff.name, email: staff.email },
    };

    const required = this.reflector.getAllAndOverride<
      StaffRequirement | undefined
    >(STAFF_ROLE, targets);
    if (required && !hasStaffRole(staff.role, required.least)) {
      throw new ForbiddenException(`Only admins can ${required.to}.`);
    }
    return true;
  }
}
