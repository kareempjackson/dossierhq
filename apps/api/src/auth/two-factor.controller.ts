import {
  twoFactorCodeSchema,
  type TwoFactorCode,
  type TwoFactorEnabled,
  type TwoFactorSetup,
  type TwoFactorStatus,
  type User,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientIp } from '../common/client-ip.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { TwoFactorService } from './two-factor.service.js';
import { NoSupport } from './support.decorator.js';

/** The signed-in person's own two-factor sign-in. */
// The owner's own, not the workspace's: refused in support views.
@NoSupport()
@Controller('auth/two-factor')
export class TwoFactorController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Get()
  status(@UserId() userId: string): Promise<TwoFactorStatus> {
    return this.twoFactor.status(userId);
  }

  /** A new secret for the authenticator app. 409 when it's already on. */
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  async setup(@UserId() userId: string): Promise<TwoFactorSetup> {
    return this.twoFactor.setup(await this.user(userId));
  }

  /** Checks a code from the app and turns it on: recovery codes, shown once. */
  @Post('enable')
  @HttpCode(HttpStatus.OK)
  async enable(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @ClientIp() ip: string | null,
    @Body(new ZodValidationPipe(twoFactorCodeSchema)) { code }: TwoFactorCode,
  ): Promise<TwoFactorEnabled> {
    return this.twoFactor.enable(
      await this.user(userId),
      workspaceId,
      code,
      ip,
    );
  }

  /** Turns it off; needs a current code or a recovery code. */
  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @ClientIp() ip: string | null,
    @Body(new ZodValidationPipe(twoFactorCodeSchema)) { code }: TwoFactorCode,
  ): Promise<void> {
    await this.twoFactor.disable(
      await this.user(userId),
      workspaceId,
      code,
      ip,
    );
  }

  private async user(userId: string): Promise<User> {
    const user = await this.db.users.get(userId);
    if (!user) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    return user;
  }
}
