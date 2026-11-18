import type { Connector } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkspaceActivity } from '../common/activity.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { SyncService } from './sync.service.js';

/**
 * Whether a tool should sync now. `maxAgeMs` is how old its data may get;
 * `triedAt` is when this API last started a sync of it, which keeps a failing
 * tool from trying more often than every `minGapMs`.
 */
export function syncDue(
  connector: Pick<Connector, 'status' | 'lastSyncAt'>,
  {
    now,
    maxAgeMs,
    minGapMs,
    triedAt,
  }: { now: number; maxAgeMs: number; minGapMs: number; triedAt?: number },
): boolean {
  if (triedAt !== undefined && now - triedAt < minGapMs) return false;
  // Failing tries again; still "syncing" here means a restart cut it short.
  if (connector.status === 'failing' || connector.status === 'syncing') {
    return true;
  }
  if (!connector.lastSyncAt) return true;
  return now - Date.parse(connector.lastSyncAt) >= maxAgeMs;
}

/**
 * Syncs connected tools when their data is wanted, not all on one beat:
 * - while someone is using a workspace, each of its tools once its data is
 *   SYNC_INTERVAL_MINUTES old (their requests say so as they arrive);
 * - before a workspace's weekly report is drafted on schedule;
 * - a failing tool, again every SYNC_INTERVAL_MINUTES;
 * - every tool at least every SYNC_BACKUP_HOURS, so a workspace nobody opens
 *   still gets alerts and reports from recent data.
 * Sync now syncs at once, as before. Looks every SYNC_INTERVAL_MINUTES, and
 * shortly after the API starts, which also finishes syncs a restart cut
 * short. In-process: each API instance syncs for its own visitors, and the
 * database makes two saves of the same tool take turns.
 */
@Injectable()
export class SyncScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SyncScheduler.name);
  private readonly timers: NodeJS.Timeout[] = [];
  /** When this API last started each workspace's tool syncing. */
  private readonly tried = new Map<string, number>();
  private readonly freshMs: number;
  private readonly backupMs: number;
  private unsubscribe?: () => void;

  constructor(
    private readonly sync: SyncService,
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly activity: WorkspaceActivity,
    config: ConfigService<AppConfig, true>,
  ) {
    this.freshMs =
      config.get('SYNC_INTERVAL_MINUTES', { infer: true }) * 60_000;
    this.backupMs = config.get('SYNC_BACKUP_HOURS', { infer: true }) * 3_600_000;
  }

  onApplicationBootstrap() {
    if (!this.freshMs) return;
    this.unsubscribe = this.activity.onSeen((workspaceId) => {
      void this.freshen(workspaceId);
    });
    this.timers.push(
      setTimeout(() => void this.look(), 5_000).unref(),
      setInterval(() => void this.look(), this.freshMs).unref(),
    );
    this.logger.log(
      `Syncing tools when they're in use and ${this.freshMs / 60_000} minutes old, and every ${this.backupMs / 3_600_000} hours otherwise`,
    );
  }

  onApplicationShutdown() {
    this.unsubscribe?.();
    for (const timer of this.timers) clearTimeout(timer);
  }

  /**
   * Syncs the workspace's tools whose data is SYNC_INTERVAL_MINUTES old, and
   * resolves when they've finished. Does nothing when automatic syncs are off.
   */
  async freshen(workspaceId: string): Promise<void> {
    if (!this.freshMs) return;
    try {
      const connectors = await this.db.connectors.list(workspaceId);
      await this.start(workspaceId, connectors, this.freshMs);
    } catch (error) {
      this.logger.warn(
        `Couldn’t freshen ${workspaceId}’s tools: ${(error as Error).message}`,
      );
    }
  }

  /** One look at every workspace, for retries and backup syncs. */
  async look() {
    try {
      const all = await this.db.connectors.listAll();
      for (const workspaceId of new Set(all.map((c) => c.workspaceId))) {
        const connectors = await this.db.connectors.list(workspaceId);
        void this.start(workspaceId, connectors, this.backupMs);
      }
    } catch (error) {
      this.logger.warn(`Couldn’t start syncs: ${(error as Error).message}`);
    }
  }

  private async start(
    workspaceId: string,
    connectors: Connector[],
    maxAgeMs: number,
  ) {
    const now = Date.now();
    const runs: Promise<void>[] = [];
    for (const connector of connectors) {
      const key = `${workspaceId}:${connector.tool}`;
      if (this.sync.busy(workspaceId, connector.tool)) continue;
      const due = syncDue(connector, {
        now,
        maxAgeMs,
        minGapMs: this.freshMs,
        triedAt: this.tried.get(key),
      });
      if (!due) continue;
      this.tried.set(key, now);
      runs.push(this.sync.sync(workspaceId, connector.tool));
    }
    await Promise.all(runs);
  }
}
