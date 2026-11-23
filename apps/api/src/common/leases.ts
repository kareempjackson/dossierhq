import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { DATABASE } from '../database/database.module.js';

/** How long a job is held before it must be renewed. */
const LEASE_MS = 5 * 60_000;

/**
 * One worker per job, across every API process on the database. Syncs and
 * AI passes take their job here first: a second process (another instance,
 * or a developer's API pointed at the same database) finds it taken and
 * leaves the work alone. A process that dies stops renewing, and the job
 * comes free when its lease lapses.
 *
 * Real time, never the pinned clock: this is about processes, not records.
 */
@Injectable()
export class WorkLeases {
  private readonly logger = new Logger(WorkLeases.name);
  /** This process, to the others. */
  readonly holder = `api-${randomUUID()}`;

  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /**
   * Does `work` if this process gets `job`, holding it until the work ends.
   * `ran` is false when another process has the job.
   */
  async run<T>(
    workspaceId: string,
    job: string,
    work: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }> {
    if (!(await this.claim(workspaceId, job))) return { ran: false };
    const renewing = setInterval(() => {
      void this.claim(workspaceId, job).catch((error: Error) =>
        this.logger.warn(`Couldn’t renew ${job}: ${error.message}`),
      );
    }, LEASE_MS / 3);
    renewing.unref();
    try {
      return { ran: true, value: await work() };
    } finally {
      clearInterval(renewing);
      await this.db.leases
        .release(workspaceId, job, this.holder)
        .catch((error: Error) =>
          this.logger.warn(`Couldn’t release ${job}: ${error.message}`),
        );
    }
  }

  /**
   * Keeps `job` from starting anywhere until `until`: a wait after a
   * failure that every process honours. Nobody holds it, so nobody renews it.
   */
  async holdOff(workspaceId: string, job: string, until: Date): Promise<void> {
    await this.db.leases.claim(
      workspaceId,
      job,
      'wait',
      new Date().toISOString(),
      until.toISOString(),
    );
  }

  /** The workspace's jobs in hand, or being held off, right now. */
  held(workspaceId: string): Promise<string[]> {
    return this.db.leases.held(workspaceId, new Date().toISOString());
  }

  private claim(workspaceId: string, job: string): Promise<boolean> {
    const now = Date.now();
    return this.db.leases.claim(
      workspaceId,
      job,
      this.holder,
      new Date(now).toISOString(),
      new Date(now + LEASE_MS).toISOString(),
    );
  }
}

@Global()
@Module({ providers: [WorkLeases], exports: [WorkLeases] })
export class LeasesModule {}
