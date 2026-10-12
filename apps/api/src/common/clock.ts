import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';

/**
 * The API's idea of "now". Pinned by CLOCK_FIXED_AT for the seeded demo,
 * real time otherwise. Inject this instead of calling `new Date()`.
 */
@Injectable()
export class Clock {
  private readonly fixedAt: string | undefined;

  constructor(config: ConfigService<AppConfig, true>) {
    this.fixedAt = config.get('CLOCK_FIXED_AT', { infer: true });
  }

  now(): string {
    return this.fixedAt
      ? new Date(this.fixedAt).toISOString()
      : new Date().toISOString();
  }
}
