import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { RateLimits } from './rate-limits.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    RateLimits,
    // Every route needs a session unless it is marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [RateLimits],
})
export class AuthModule {}
