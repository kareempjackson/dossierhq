import type { HealthResponse } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { DATABASE } from '../database/database.module.js';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    const up = await this.db.ping().then(
      () => true,
      (error: Error) => {
        this.logger.warn(error.message);
        return false;
      },
    );
    if (!up) res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: up ? 'ok' : 'degraded',
      database: { provider: this.db.provider, status: up ? 'up' : 'down' },
    };
  }
}
