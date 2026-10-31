import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { AppConfig } from '../config/configuration.js';
import { Secrets } from '../integrations/secrets.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { RateLimits } from './rate-limits.js';
import { SupportAccess } from './support-access.service.js';
import { TwoFactorController } from './two-factor.controller.js';
import { TwoFactorService } from './two-factor.service.js';

@Module({
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    RateLimits,
    SupportAccess,
    TwoFactorService,
    {
      // Seals two-factor secrets with the same key as tool credentials.
      provide: Secrets,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new Secrets(config.get('CONNECTOR_SECRET_KEY', { infer: true })),
    },
    // Every route needs a session unless it is marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, RateLimits, SupportAccess],
})
export class AuthModule {}
