import type {
  Staff,
  StaffAuditPage,
  StaffAuditQuery,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { pageOfLog } from '../common/log-page.js';
import { DATABASE } from '../database/database.module.js';

/** A member of staff as the log names them; null from the command line. */
export type StaffActor = Pick<Staff, 'id' | 'name' | 'email'>;

export type StaffEvent = {
  what: string;
  /** The workspace it concerned, if any. */
  workspaceId?: string | null;
  /** The person in a workspace it concerned, if any. */
  userId?: string | null;
  outcome?: 'ok' | 'failed';
  ip?: string | null;
};

/**
 * What staff did, kept apart from workspaces' own audit logs, so it outlives
 * a deleted workspace. Actions on a workspace also go in that workspace's
 * log, for its owners to see.
 */
@Injectable()
export class StaffAudit {
  private readonly logger = new Logger(StaffAudit.name);

  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** Never throws: a failed write is logged, and what happened still stands. */
  async record(staff: StaffActor | null, event: StaffEvent): Promise<void> {
    try {
      await this.db.staffAudit.append({
        id: `sau-${randomUUID()}`,
        at: new Date().toISOString(),
        staff: staff && { id: staff.id, name: staff.name, email: staff.email },
        what: event.what,
        workspaceId: event.workspaceId ?? null,
        userId: event.userId ?? null,
        outcome: event.outcome ?? 'ok',
        ip: event.ip ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `Couldn’t write to the staff log (${event.what}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  page({ workspaceId, ...query }: StaffAuditQuery): Promise<StaffAuditPage> {
    return pageOfLog(
      (window) => this.db.staffAudit.list({ workspaceId, ...window }),
      query,
      'That page of the staff log isn’t valid. Start from the newest entries.',
    );
  }
}
