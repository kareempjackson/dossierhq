import type { ReportStatus, ReportSummary } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { notFound } from '../common/not-found.js';
import { DATABASE } from '../database/database.module.js';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly clock: Clock,
  ) {}

  /** Drafts waiting for review: those with exceptions first, then clean ones. */
  async queue(workspaceId: string): Promise<ReportSummary[]> {
    const drafts = await this.db.reports.listSummaries(workspaceId, {
      status: 'draft',
    });
    return [
      ...drafts.filter((report) => report.exceptions.length > 0),
      ...drafts.filter((report) => report.exceptions.length === 0),
    ];
  }

  /** Approve, skip, or put back to draft. Approving stamps the time. */
  async setStatus(
    workspaceId: string,
    ids: string[],
    status: ReportStatus,
  ): Promise<ReportSummary[]> {
    return this.db.reports.setStatus(
      workspaceId,
      ids,
      status,
      this.clock.now(),
    );
  }

  async setOneStatus(
    workspaceId: string,
    id: string,
    status: ReportStatus,
  ): Promise<ReportSummary> {
    const [updated] = await this.setStatus(workspaceId, [id], status);
    return updated ?? notFound('Report', id);
  }
}
