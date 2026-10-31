import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { DATABASE } from '../database/database.module.js';
import { EventBus } from '../events/event-bus.js';
import { DAY_MS } from '../integrations/ids.js';
import { SyncService } from '../integrations/sync.service.js';
import { IntelligenceService } from './intelligence.service.js';
import { MeetingPointsExtractor } from './meeting-points.js';
import { PatternFinder } from './patterns.js';
import { RecommendationDrafter } from './recommendations.js';

/** How long what was read from a meeting outlives the meeting in Fathom. */
const POINTS_GRACE_MS = 7 * DAY_MS;

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
 * Drafts after syncs, and after notes arrive: once a workspace has settled,
 * each client's new meetings and notes are read, then each client whose
 * records changed (or that hasn't been drafted for in a day) gets fresh
 * recommendations, then Dossier looks for patterns across the clients.
 * In-process, like the sync scheduler.
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
    private readonly meetings: MeetingPointsExtractor,
    private readonly drafter: RecommendationDrafter,
    private readonly patterns: PatternFinder,
    private readonly events: EventBus,
  ) {}

  onModuleInit() {
    // Any workspace may bring its own key, so syncs always count; a pass
    // checks for a key before it spends anything.
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
    // Suspended since the pass was asked for: it costs model runs, so skip.
    if (await this.db.workspaces.suspension(workspaceId)) return;
    // No key for the workspace's model: nothing would draft.
    if (await this.intelligence.off(workspaceId)) return;
    const startedAt = new Date().toISOString();
    const clients = await this.db.clients.list(workspaceId);
    const queue = clients.map((client) => client.id);
    const failures: string[] = [];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        // Meetings first, so the recommendations see what was said in them.
        await this.meetings
          .extract(workspaceId, id)
          .catch((error: Error) =>
            this.logger.warn(
              `Reading meetings for ${id} failed: ${error.message}`,
            ),
          );
        await this.drafter
          .draft(workspaceId, id, { force })
          .catch((error: Error) => {
            failures.push(error.message);
            this.logger.warn(
              `Drafting recommendations for ${id} failed: ${error.message}`,
            );
          });
      }
    };
    await Promise.all(Array.from({ length: this.options.concurrency }, worker));
    await this.announce(workspaceId, startedAt, failures);
    const now = Date.now();
    await this.db.meetingPoints
      .prune(
        workspaceId,
        new Date(now).toISOString(),
        new Date(now - POINTS_GRACE_MS).toISOString(),
      )
      .catch((error: Error) =>
        this.logger.warn(`Pruning meeting points failed: ${error.message}`),
      );
    // Last, so it sees what was read and drafted for every client.
    await this.patterns
      .find(workspaceId)
      .catch((error: Error) =>
        this.logger.warn(`Finding patterns failed: ${error.message}`),
      );
  }

  /** Tells the team what a pass drafted, and admins what it couldn't. */
  private async announce(
    workspaceId: string,
    startedAt: string,
    failures: string[],
  ) {
    try {
      const drafted = (
        await this.db.recommendations.list(workspaceId, { status: 'draft' })
      ).filter((rec) => rec.createdAt >= startedAt);
      if (drafted.length > 0) {
        await this.events.publish(workspaceId, null, {
          type: 'intelligence.drafted',
          clients: new Set(drafted.map((rec) => rec.clientId)).size,
          recommendations: drafted.length,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Couldn’t count new drafts: ${(error as Error).message}`,
      );
    }
    if (failures.length > 0) {
      // A broken key fails every pass; once a day is enough to hear it.
      await this.events.publish(
        workspaceId,
        null,
        {
          type: 'intelligence.failed',
          failed: failures.length,
          problem: failures[0]!,
        },
        { dedupeKey: `intelligence-failed:${startedAt.slice(0, 10)}` },
      );
    }
  }
}
