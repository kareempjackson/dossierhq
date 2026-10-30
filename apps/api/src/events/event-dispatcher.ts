import { domainEventSchema } from '@dossierhq/contracts';
import type { DatabaseAdapter, EventRecord } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../common/clock.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { EventBus, type RecordedEvent } from './event-bus.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How long to wait after each failed try: then it's given up on. */
export const RETRY_DELAYS_MS = [
  MINUTE_MS,
  5 * MINUTE_MS,
  30 * MINUTE_MS,
  2 * HOUR_MS,
  12 * HOUR_MS,
];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Events claimed at once, and how long a claim holds them. */
const BATCH = 25;
const LEASE_MS = 5 * MINUTE_MS;
/** Handled events are kept this long, for looking into what happened. */
const EVENT_DAYS = 30;

const later = (now: string, ms: number) =>
  new Date(Date.parse(now) + ms).toISOString();
const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Hands recorded events to the EventBus's subscribers: as soon as each is
 * recorded, and every EVENTS_POLL_SECONDS for retries and for anything left
 * when the API last stopped. An event goes to every subscriber; when any of
 * them fails it's tried again after RETRY_DELAYS_MS, and given up on after
 * MAX_ATTEMPTS. Claims are held in the database, so a second API instance
 * takes other events rather than the same ones.
 */
@Injectable()
export class EventDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EventDispatcher.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly seconds: number;
  /** When each workspace's old events were last pruned. */
  private readonly pruned = new Map<string, number>();
  private running: Promise<void> | null = null;
  private again = false;
  private nudge: NodeJS.Timeout | null = null;
  private unsubscribe?: () => void;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    config: ConfigService<AppConfig, true>,
  ) {
    this.seconds = config.get('EVENTS_POLL_SECONDS', { infer: true });
  }

  onApplicationBootstrap() {
    if (!this.seconds) return;
    this.unsubscribe = this.bus.onRecorded(() => this.soon());
    this.timers.push(
      setTimeout(() => void this.tick(), 5_000).unref(),
      setInterval(() => void this.tick(), this.seconds * 1000).unref(),
    );
    this.logger.log(`Handing on events every ${this.seconds} seconds`);
  }

  onApplicationShutdown() {
    this.unsubscribe?.();
    for (const timer of this.timers) clearTimeout(timer);
    if (this.nudge) clearTimeout(this.nudge);
  }

  /** Looks in a moment, so a burst of events is one look. */
  soon() {
    if (this.nudge) return;
    this.nudge = setTimeout(() => {
      this.nudge = null;
      void this.tick();
    }, 250).unref();
  }

  /**
   * Hands on every event due by `now`. Never overlaps itself: asked while
   * running, it looks once more when done, for events recorded meanwhile.
   */
  tick(now = this.clock.now()): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.drain(now).finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.tick();
      }
    });
    return this.running;
  }

  private async drain(now: string) {
    for (;;) {
      let claimed: EventRecord[];
      try {
        claimed = await this.db.events.claim(now, later(now, LEASE_MS), BATCH);
      } catch (error) {
        this.logger.warn(`Couldn’t claim events: ${reason(error)}`);
        return;
      }
      for (const record of claimed) await this.dispatch(record, now);
      if (claimed.length < BATCH) return;
    }
  }

  private async dispatch(record: EventRecord, now: string) {
    const { workspaceId, id } = record;
    const parsed = domainEventSchema.safeParse({
      ...record.payload,
      type: record.type,
    });
    if (!parsed.success) {
      this.logger.error(`Event ${id} isn’t one Dossier knows: ${record.type}`);
      await this.db.events
        .markFailed(workspaceId, id, now, `Not a known event: ${record.type}`)
        .catch(this.warn);
      return;
    }
    const recorded: RecordedEvent = {
      id,
      workspaceId,
      actorUserId: record.actorUserId,
      occurredAt: record.occurredAt,
      attempts: record.attempts,
      event: parsed.data,
    };

    const failures: string[] = [];
    for (const [name, handle] of this.bus.handlers()) {
      try {
        await handle(recorded);
      } catch (error) {
        failures.push(`${name}: ${reason(error)}`);
      }
    }

    const problem = failures.join('; ');
    try {
      if (failures.length === 0) {
        await this.db.events.markDispatched(workspaceId, id, this.clock.now());
      } else if (record.attempts >= MAX_ATTEMPTS) {
        this.logger.error(
          `Gave up on ${record.type} (${id}) for ${workspaceId} after ${record.attempts} tries: ${problem}`,
        );
        await this.db.events.markFailed(workspaceId, id, now, problem);
      } else {
        const wait = RETRY_DELAYS_MS[record.attempts - 1]!;
        this.logger.warn(
          `${record.type} (${id}) failed, trying again in ${wait / MINUTE_MS} minutes: ${problem}`,
        );
        await this.db.events.retry(workspaceId, id, later(now, wait), problem);
      }
    } catch (error) {
      this.warn(error);
    }
    await this.prune(workspaceId, now);
  }

  /** Drops a workspace's old handled events, at most once an hour. */
  private async prune(workspaceId: string, now: string) {
    const at = Date.parse(now);
    const last = this.pruned.get(workspaceId);
    if (last !== undefined && at - last < HOUR_MS) return;
    this.pruned.set(workspaceId, at);
    await this.db.events
      .prune(workspaceId, new Date(at - EVENT_DAYS * DAY_MS).toISOString())
      .catch(this.warn);
  }

  private readonly warn = (error: unknown) =>
    this.logger.warn(`Couldn’t update an event: ${reason(error)}`);
}
