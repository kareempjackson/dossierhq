import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dueClients } from '../common/changes.js';
import { WorkLeases } from '../common/leases.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { MemoryIndexer } from '../memory/indexer.js';
import { PersonProfiler } from './person-profiles.js';
import { ThemeFinder } from './themes.js';
import { TicketReader } from './ticket-insights.js';
import { EventBus } from '../events/event-bus.js';
import { DAY_MS } from '../integrations/ids.js';
import { SyncService } from '../integrations/sync.service.js';
import { IntelligenceService } from './intelligence.service.js';
import { MeetingPointsExtractor } from './meeting-points.js';
import { PatternFinder } from './patterns.js';
import { RecommendationDrafter } from './recommendations.js';

/** The job a pass holds while it runs (see WorkLeases). */
export const PASS_JOB = 'intelligence';

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
 * One pass per workspace at a time, across every API process (WorkLeases).
 */
@Injectable()
export class IntelligenceScheduler
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(IntelligenceScheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Map<string, Promise<void>>();
  /** Whether passes follow syncs by themselves (BACKGROUND_WORK). */
  private background = false;
  private unsubscribe?: () => void;
  private unsubscribeTranscripts?: () => void;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(INTELLIGENCE_OPTIONS) private readonly options: IntelligenceOptions,
    private readonly sync: SyncService,
    private readonly intelligence: IntelligenceService,
    private readonly meetings: MeetingPointsExtractor,
    private readonly drafter: RecommendationDrafter,
    private readonly patterns: PatternFinder,
    private readonly events: EventBus,
    private readonly memory: MemoryIndexer,
    private readonly tickets: TicketReader,
    private readonly people: PersonProfiler,
    private readonly themes: ThemeFinder,
    private readonly leases: WorkLeases,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onModuleInit() {
    // Any workspace may bring its own key, so syncs always count; a pass
    // checks for a key before it spends anything. With BACKGROUND_WORK off
    // nothing follows a sync by itself; Draft still asks for a pass by hand.
    this.background =
      this.config.get('BACKGROUND_WORK', { infer: true }) === 'on';
    if (this.background) {
      this.unsubscribe = this.sync.onSynced((workspaceId) =>
        this.soon(workspaceId),
      );
    }
    this.unsubscribeTranscripts = this.sync.onTranscripts(
      async (workspaceId, transcripts) => {
        await this.memory.rememberTranscripts(workspaceId, transcripts);
      },
    );
  }

  onApplicationShutdown() {
    this.unsubscribe?.();
    this.unsubscribeTranscripts?.();
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
    // Another API process may be at it already: then this one stands down.
    const pass = this.leases
      .run(workspaceId, PASS_JOB, () => this.pass(workspaceId, force))
      .then(() => undefined)
      .finally(() => this.running.delete(workspaceId));
    this.running.set(workspaceId, pass);
    return pass;
  }

  private async pass(workspaceId: string, force: boolean) {
    // Suspended since the pass was asked for: it costs model runs, so skip.
    if (await this.db.workspaces.suspension(workspaceId)) return;
    // What's due: each step looks only at the clients whose records changed
    // since it last finished with them (see ChangesRepository). Changes
    // noted after this moment are left for the next pass.
    const startedAt = new Date().toISOString();
    const [clients, changes] = await Promise.all([
      this.db.clients.list(workspaceId),
      this.db.changes.list(workspaceId),
    ]);
    const everyone = clients.map((client) => client.id);
    const due = async (step: string, staleMs?: number) =>
      force
        ? everyone
        : dueClients(
            everyone,
            changes,
            await this.db.changes.marks(workspaceId, step),
            staleMs === undefined
              ? undefined
              : new Date(Date.now() - staleMs).toISOString(),
          );
    const finished = (step: string, clientIds: string[]) =>
      this.db.changes
        .mark(workspaceId, step, clientIds, startedAt)
        .catch((error: Error) =>
          this.logger.warn(`Noting ${step} as done failed: ${error.message}`),
        );

    // Memory first: it needs no model, and what's read next searches it.
    const toIndex = await due('memory');
    await this.memory
      .index(workspaceId, { clientIds: toIndex })
      .then(() => finished('memory', toIndex))
      .catch((error: Error) =>
        this.logger.warn(`Updating memory failed: ${error.message}`),
      );
    // Held at a limit (the trial, the day's budget, a pause after failures):
    // nothing below could run, so none of it is loaded. Admins hear once a day.
    const held = await this.intelligence
      .waiting(workspaceId, 'drafting')
      .catch(() => null);
    if (held && held.reason !== 'off' && !force) {
      this.logger.log(`Not drafting for ${workspaceId}: ${held.message}`);
      const day = new Date().toISOString().slice(0, 10);
      await this.events.publish(
        workspaceId,
        null,
        {
          type: 'intelligence.waiting',
          reason: held.reason,
          detail: held.message,
        },
        { dedupeKey: `intelligence-waiting:${held.reason}:${day}` },
      );
      return;
    }
    // Then each changed ticket is read, on the reading model, and what was
    // read goes back into memory, where similar tickets are found by it.
    const toRead = await due('tickets');
    const reading = await this.tickets
      .sweep(workspaceId, { clientIds: toRead })
      .catch((error: Error) => {
        this.logger.warn(`Reading tickets failed: ${error.message}`);
        return { read: 0, done: false };
      });
    if (reading.done) await finished('tickets', toRead);
    if (reading.read > 0) {
      await this.memory
        .index(workspaceId, { clientIds: toRead })
        .catch((error: Error) =>
          this.logger.warn(`Updating memory failed: ${error.message}`),
        );
    }
    // People, from what was just read off their tickets.
    const toProfile = await due('people');
    const profiling = await this.people
      .sweep(workspaceId, { clientIds: toProfile })
      .catch((error: Error) => {
        this.logger.warn(`Profiling people failed: ${error.message}`);
        return { profiled: 0, done: false };
      });
    if (profiling.done) await finished('people', toProfile);
    // More left than one pass takes, and this one got somewhere: carry on
    // shortly, rather than wait for the next sync that changes something.
    if (
      this.background &&
      !force &&
      ((!reading.done && reading.read > 0) ||
        (!profiling.done && profiling.profiled > 0))
    ) {
      this.soon(workspaceId);
    }
    // No key for the workspace's model: nothing would draft.
    if (await this.intelligence.off(workspaceId)) return;
    // Meetings and recurring issues for clients that changed, or that were
    // last looked at over a day ago. Drafts keep their own mark: a client
    // drafted for too recently stays due until it can be drafted for again.
    const [toVisit, toDraft] = await Promise.all([
      due('clients', DAY_MS),
      due('drafts', DAY_MS),
    ]);
    const visiting = new Set(toVisit);
    const drafting = new Set(toDraft);
    const queue = everyone.filter((id) => visiting.has(id) || drafting.has(id));
    const visited: string[] = [];
    const drafted: string[] = [];
    const failures: string[] = [];
    let asked = 0;
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        if (visiting.has(id)) {
          // Meetings first, so the recommendations see what was said in them.
          await this.meetings
            .extract(workspaceId, id)
            .catch((error: Error) =>
              this.logger.warn(
                `Reading meetings for ${id} failed: ${error.message}`,
              ),
            );
          // What keeps coming back, so recommendations can say fix it once.
          await this.themes
            .find(workspaceId, id)
            .catch((error: Error) =>
              this.logger.warn(
                `Finding recurring issues for ${id} failed: ${error.message}`,
              ),
            );
          visited.push(id);
        }
        if (!drafting.has(id)) continue;
        let waiting = false;
        await this.drafter
          .draft(workspaceId, id, { force, onWait: () => (waiting = true) })
          .then((ran) => {
            if (ran) asked += 1;
            if (!waiting) drafted.push(id);
          })
          .catch((error: Error) => {
            failures.push(error.message);
            this.logger.warn(
              `Drafting recommendations for ${id} failed: ${error.message}`,
            );
          });
      }
    };
    await Promise.all(Array.from({ length: this.options.concurrency }, worker));
    await finished('clients', visited);
    await finished('drafts', drafted);
    if (asked > 0 || failures.length > 0) {
      await this.announce(workspaceId, startedAt, failures);
    }
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
