import { createDatabase, type DatabaseAdapter } from '@dossierhq/database';
import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../common/clock.js';
import type { AppConfig } from '../config/configuration.js';

/** Injection token for the active {@link DatabaseAdapter}. */
export const DATABASE = Symbol('DATABASE');

/**
 * The only place the API learns which database it runs on. Feature modules
 * inject DATABASE and use its repositories; none of them import a driver, so
 * switching DATABASE_PROVIDER needs no code changes anywhere else.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const db = await createDatabase(
          config.get('database', { infer: true }),
        );
        new Logger(DatabaseModule.name).log(
          `Using the "${db.provider}" database adapter`,
        );
        return db;
      },
    },
    Clock,
  ],
  exports: [DATABASE, Clock],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  async onApplicationShutdown() {
    await this.db.close();
  }
}
