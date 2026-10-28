import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { ResetLimiter, SignInLimiter } from './sign-in-limiter.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SignInLimiter,
    ResetLimiter,
    // Every route needs a session unless it is marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
