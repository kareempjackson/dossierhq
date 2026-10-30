import {
  domainEventSchema,
  type DomainEvent,
  type User,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Clock } from '../common/clock.js';
import { DATABASE } from '../database/database.module.js';

/** An event as subscribers get it: what happened, and where and when. */
export type RecordedEvent = {
  id: string;
  workspaceId: string;
  /** Null when Dossier did it. */
  actorUserId: string | null;
  occurredAt: string;
  /** Tries so far, this one included. */
  attempts: number;
  event: DomainEvent;
};

/**
 * Handles one event. Throwing hands it back to be tried again later, to
 * every subscriber, so handlers must be safe to run twice.
 */
export type EventHandler = (recorded: RecordedEvent) => Promise<void>;

export type PublishOptions = {
  /** Records the event once per workspace; later ones with the key are dropped. */
  dedupeKey?: string;
};

/**
 * Where features say what happened. Each event is recorded in the outbox
 * (db.events) after the change it describes, and the EventDispatcher hands
 * it to every subscriber, trying again when one fails. Recording happens
 * after the change, not with it, so an API that dies between the two loses
 * that event; once recorded, it's handed on until it's handled.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly subscribers = new Map<string, EventHandler>();
  private readonly recorded = new Set<() => void>();

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly clock: Clock,
  ) {}

  /**
   * Records that something happened in the workspace; `actor` is who did
   * it, or null for Dossier. Never throws: a failed write is logged, and
   * the change it describes still stands.
   */
  async publish(
    workspaceId: string,
    actor: string | null,
    event: DomainEvent,
    { dedupeKey }: PublishOptions = {},
  ): Promise<void> {
    try {
      const { type, ...payload } = domainEventSchema.parse(event);
      const recorded = await this.db.events.append(workspaceId, {
        id: `evt-${randomUUID()}`,
        type,
        actorUserId: actor,
        payload,
        dedupeKey: dedupeKey ?? null,
        occurredAt: this.clock.now(),
      });
      if (recorded) this.announce();
    } catch (error) {
      this.logger.warn(
        `Couldn’t record ${event.type} for ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Publishes in every workspace the user belongs to, for what happens to
   * their account before any workspace is known, e.g. a lockout. Nobody is
   * the actor: whoever tried may not have been them.
   */
  async publishForUser(
    user: Pick<User, 'id'>,
    event: DomainEvent,
    options?: PublishOptions,
  ): Promise<void> {
    try {
      const memberships = await this.db.users.memberships(user.id);
      await Promise.all(
        memberships.map((m) =>
          this.publish(m.workspaceId, null, event, options),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Couldn’t record ${event.type} for ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Adds a handler for every event, under a name for the logs. */
  subscribe(name: string, handler: EventHandler): () => void {
    if (this.subscribers.has(name)) {
      throw new Error(`An event subscriber called ${name} already exists`);
    }
    this.subscribers.set(name, handler);
    return () => this.subscribers.delete(name);
  }

  /** The subscribers by name, in the order they subscribed. */
  handlers(): [string, EventHandler][] {
    return [...this.subscribers];
  }

  /** Calls `listener` whenever an event is recorded; for the dispatcher. */
  onRecorded(listener: () => void): () => void {
    this.recorded.add(listener);
    return () => this.recorded.delete(listener);
  }

  private announce() {
    for (const listener of this.recorded) {
      try {
        listener();
      } catch (error) {
        this.logger.warn(
          `An event listener failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
