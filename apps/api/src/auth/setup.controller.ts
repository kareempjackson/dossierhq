import {
  setupRequestSchema,
  type SetupRequest,
  type SetupStatus,
  type SignInResponse,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

/** First run: open until the first account exists, then closed for good. */
@Controller('setup')
export class SetupController {
  constructor(
    private readonly auth: AuthService,
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
  ) {}

  @Public()
  @Get()
  async status(): Promise<SetupStatus> {
    return { needed: !(await this.db.users.any()) };
  }

  /** Creates the workspace and its owner, and signs them in. 409 afterwards. */
  @Public()
  @Post()
  create(
    @Body(new ZodValidationPipe(setupRequestSchema)) request: SetupRequest,
  ): Promise<SignInResponse> {
    return this.auth.setUp(request);
  }
}
