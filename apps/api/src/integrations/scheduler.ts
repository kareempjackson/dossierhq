import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { SyncService } from './sync.service.js';

/**
 * Syncs every connected tool every SYNC_INTERVAL_MINUTES, and once shortly
 * after the API starts (which also finishes syncs a restart interrupted).
 * In-process: run one API instance per database, or move this to a job queue.
 */
@Injectable()
export class SyncScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SyncScheduler.name);
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly sync: SyncService,
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onApplicationBootstrap() {
    const minutes = this.config.get('SYNC_INTERVAL_MINUTES', { infer: true });
    if (!minutes) return;
    this.timers.push(
      setTimeout(() => void this.syncAll(), 5_000).unref(),
      setInterval(() => void this.syncAll(), minutes * 60_000).unref(),
    );
    this.logger.log(`Syncing connected tools every ${minutes} minutes`);
  }

  onApplicationShutdown() {
    for (const timer of this.timers) clearTimeout(timer);
  }

  async syncAll() {
    try {
      for (const { workspaceId, tool } of await this.db.connectors.listAll()) {
        void this.sync.sync(workspaceId, tool);
      }
    } catch (error) {
      this.logger.warn(`Couldn’t start syncs: ${(error as Error).message}`);
    }
  }
}
