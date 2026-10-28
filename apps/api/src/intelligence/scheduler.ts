import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { DATABASE } from '../database/database.module.js';
import { SyncService } from '../integrations/sync.service.js';
import { IntelligenceService } from './intelligence.service.js';
import { RecommendationDrafter } from './recommendations.js';

export type IntelligenceOptions = {
  /** How long after the last sync to wait, so every tool has landed. */
  settleMs: number;
  /** Clients drafted for at once. */
  concurrency: number;
};

/** Injection token for IntelligenceOptions (tests shorten the wait). */
export const INTELLIGENCE_OPTIONS = Symbol('INTELLIGENCE_OPTIONS');

export const DEFAULT_INTELLIGENCE_OPTIONS: IntelligenceOptions = {
  settleMs: 60_000,
  concurrency: 2,
};

/**
 * Drafts after syncs: once a workspace's syncs have settled, each client
 * whose records changed (or that hasn't been drafted for in a day) gets fresh
 * recommendations. In-process, like the sync scheduler.
 */
@Injectable()
export class IntelligenceScheduler
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(IntelligenceScheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Map<string, Promise<void>>();
  private unsubscribe?: () => void;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(INTELLIGENCE_OPTIONS) private readonly options: IntelligenceOptions,
    private readonly sync: SyncService,
    private readonly intelligence: IntelligenceService,
    private readonly drafter: RecommendationDrafter,
  ) {}

  onModuleInit() {
    if (!this.intelligence.enabled) {
      this.logger.log('Drafting with Claude is off: no ANTHROPIC_API_KEY.');
      return;
    }
    this.unsubscribe = this.sync.onSynced((workspaceId) =>
      this.soon(workspaceId),
    );
  }

  onApplicationShutdown() {
    this.unsubscribe?.();
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  /** Drafts for the workspace once syncs have been quiet for a while. */
  soon(workspaceId: string) {
    clearTimeout(this.timers.get(workspaceId));
    this.timers.set(
      workspaceId,
      setTimeout(() => {
        this.timers.delete(workspaceId);
        void this.now(workspaceId);
      }, this.options.settleMs),
    );
  }

  /**
   * Drafts for every client in the workspace; `force` ignores whether their
   * records changed. Resolves when done. One pass per workspace at a time.
   */
  now(workspaceId: string, { force = false } = {}): Promise<void> {
    const current = this.running.get(workspaceId);
    if (current) return current;
    const pass = this.pass(workspaceId, force).finally(() =>
      this.running.delete(workspaceId),
    );
    this.running.set(workspaceId, pass);
    return pass;
  }

  private async pass(workspaceId: string, force: boolean) {
    const clients = await this.db.clients.list(workspaceId);
    const queue = clients.map((client) => client.id);
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        await this.drafter
          .draft(workspaceId, id, { force })
          .catch((error: Error) =>
            this.logger.warn(
              `Drafting recommendations for ${id} failed: ${error.message}`,
            ),
          );
      }
    };
    await Promise.all(Array.from({ length: this.options.concurrency }, worker));
  }
}
