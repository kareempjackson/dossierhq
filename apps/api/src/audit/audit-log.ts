import type {
  AuditActor,
  AuditKind,
  AuditOutcome,
  Tool,
  User,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';

/**
 * Something a person did, or tried to. Syncs log their own reads; a `read`
 * here is one a person asked for, like testing a connection.
 */
export type AuditEvent = {
  kind: AuditKind;
  /** Past tense, without the person, e.g. "Approved the weekly report". */
  what: string;
  tool?: Tool | null;
  clientId?: string | null;
  outcome?: AuditOutcome;
  /** For sign-ins: the visitor's trusted address, when known. */
  ip?: string | null;
};

/**
 * Who: their user ID, or the user when it is already at hand. Dossier's
 * staff have no user in the workspace, so their `id` is null; never pass a
 * staff ID here, since the log's actor must be a user (or nobody).
 */
export type Actor =
  | string
  | Pick<User, 'id' | 'name' | 'email'>
  | { id: null; name: string; email: string };

/** A member of Dossier's staff, as a workspace's own log names them. */
export const supportActor = (staff: { name: string; email: string }) => ({
  id: null,
  name: `Dossier support (${staff.name})`,
  email: staff.email,
});

const DAY_MS = 86_400_000;

/**
 * The audit log's writer for sign-ins and changes, and its retention: reads
 * are kept for AUDIT_READ_DAYS, sign-ins and changes for AUDIT_EVENT_DAYS.
 */
@Injectable()
export class AuditLog {
  private readonly logger = new Logger(AuditLog.name);
  private readonly readDays: number;
  private readonly eventDays: number;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    config: ConfigService<AppConfig, true>,
  ) {
    this.readDays = config.get('AUDIT_READ_DAYS', { infer: true });
    this.eventDays = config.get('AUDIT_EVENT_DAYS', { infer: true });
  }

  /**
   * Writes what someone did to the workspace's log; null for someone outside
   * it, like a stranger emailing its notes address. Never throws: a failed
   * write is logged, and what they did still stands.
   */
  async record(
    workspaceId: string,
    actor: Actor | null,
    ...events: AuditEvent[]
  ): Promise<void> {
    if (events.length === 0) return;
    try {
      const person = actor === null ? null : await this.actorOf(actor);
      const at = new Date().toISOString();
      await this.db.audit.append(
        workspaceId,
        events.map((event) => ({
          id: `aud-${randomUUID()}`,
          at,
          kind: event.kind,
          tool: event.tool ?? null,
          what: event.what,
          clientId: event.clientId ?? null,
          recordCount: 0,
          outcome: event.outcome ?? 'ok',
          actor: person,
          ip: event.ip ?? null,
        })),
      );
    } catch (error) {
      this.warn(error);
    }
  }

  /** Writes to every workspace the user belongs to, e.g. a failed sign-in. */
  async recordForUser(
    user: Pick<User, 'id' | 'name' | 'email'>,
    event: AuditEvent,
  ): Promise<void> {
    try {
      const memberships = await this.db.users.memberships(user.id);
      await Promise.all(
        memberships.map((m) => this.record(m.workspaceId, user, event)),
      );
    } catch (error) {
      this.warn(error);
    }
  }

  /** Drops what has outlived its retention. */
  async prune(workspaceId: string, now = new Date()): Promise<void> {
    const before = (days: number) =>
      new Date(now.getTime() - days * DAY_MS).toISOString();
    try {
      await this.db.audit.prune(workspaceId, before(this.readDays), ['read']);
      await this.db.audit.prune(workspaceId, before(this.eventDays), [
        'sign-in',
        'change',
      ]);
    } catch (error) {
      this.warn(error);
    }
  }

  private async actorOf(actor: Actor): Promise<AuditActor> {
    if (typeof actor !== 'string') {
      return { userId: actor.id, name: actor.name, email: actor.email };
    }
    const user = await this.db.users.get(actor);
    return user
      ? { userId: user.id, name: user.name, email: user.email }
      : { userId: actor, name: actor, email: actor };
  }

  private warn(error: unknown) {
    this.logger.warn(
      `Couldn’t write to the audit log: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
