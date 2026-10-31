import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import type { AppConfig } from '../config/configuration.js';
import { Secrets } from '../integrations/secrets.js';
import { PlatformService } from './platform.service.js';
import { StaffAudit } from './staff-audit.js';
import { StaffAuthController } from './staff-auth.controller.js';
import { StaffAuthService } from './staff-auth.service.js';
import { ActivityController, StaffController } from './staff.controller.js';
import { StaffGuard } from './staff.guard.js';
import { StaffService } from './staff.service.js';
import { SupportController } from './support.controller.js';
import {
  PeopleController,
  WorkspacesController,
} from './workspaces.controller.js';

/**
 * The /admin routes, for Dossier's staff through the admin app. Apart from
 * workspaces' sign-in: StaffGuard handles every @Staff() route, and
 * AuthGuard leaves them alone.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    StaffAuthController,
    StaffController,
    ActivityController,
    WorkspacesController,
    PeopleController,
    SupportController,
  ],
  providers: [
    PlatformService,
    StaffAudit,
    StaffAuthService,
    StaffService,
    {
      // Seals staff two-factor secrets with the same key as tool credentials.
      provide: Secrets,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new Secrets(config.get('CONNECTOR_SECRET_KEY', { infer: true })),
    },
    { provide: APP_GUARD, useClass: StaffGuard },
  ],
})
export class AdminModule {}
