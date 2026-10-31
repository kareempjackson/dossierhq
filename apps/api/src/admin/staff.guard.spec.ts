import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { AppConfig } from '../config/configuration.js';
import type { StaffAuthService } from './staff-auth.service.js';
import { ADMIN_KEY_HEADER, Staff } from './staff.decorator.js';
import { StaffGuard } from './staff.guard.js';

const KEY = 'an-admin-api-key-that-is-long-enough';

@Staff()
class StaffRoutes {
  handle() {}
}
class WorkspaceRoutes {
  handle() {}
}

const contextFor = (
  routes: new () => { handle(): void },
  headers: Record<string, string>,
) =>
  ({
    getHandler: () => routes.prototype.handle,
    getClass: () => routes,
    switchToHttp: () => ({
      getRequest: () => ({ headers, method: 'GET', path: '/admin/staff' }),
    }),
  }) as unknown as ExecutionContext;

const guardWith = (adminKey: string | undefined) =>
  new StaffGuard(
    new Reflector(),
    { authenticate: async () => null } as unknown as StaffAuthService,
    { get: () => adminKey } as unknown as ConfigService<AppConfig, true>,
  );

describe('StaffGuard', () => {
  it('hides staff routes when ADMIN_API_KEY is unset, whatever is sent', async () => {
    await expect(
      guardWith(undefined).canActivate(
        contextFor(StaffRoutes, { [ADMIN_KEY_HEADER]: KEY }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides them without the key, then asks for a session', async () => {
    const guard = guardWith(KEY);
    await expect(
      guard.canActivate(contextFor(StaffRoutes, {})),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      guard.canActivate(contextFor(StaffRoutes, { [ADMIN_KEY_HEADER]: KEY })),
    ).rejects.toThrow('Sign in to continue');
  });

  it('leaves routes that aren’t staff to AuthGuard', async () => {
    await expect(
      guardWith(undefined).canActivate(contextFor(WorkspaceRoutes, {})),
    ).resolves.toBe(true);
  });
});
