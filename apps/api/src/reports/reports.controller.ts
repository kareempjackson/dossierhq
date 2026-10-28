import {
  bulkReportStatusUpdateSchema,
  reportDraftRequestSchema,
  reportsQuerySchema,
  reportStatusUpdateSchema,
  type BulkReportStatusUpdate,
  type List,
  type Report,
  type ReportDraftRequest,
  type ReportStatus,
  type ReportStatusUpdate,
  type ReportSummary,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuditLog, type AuditEvent } from '../audit/audit-log.js';
import { notFound } from '../common/not-found.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly reports: ReportsService,
    private readonly audit: AuditLog,
  ) {}

  /** Summaries, newest week first, then by client name. */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(reportsQuerySchema))
    filter: { clientId?: string; status?: ReportStatus },
  ): Promise<List<ReportSummary>> {
    return { data: await this.db.reports.listSummaries(workspaceId, filter) };
  }

  /**
   * Drafts this week's report now, for one client or, without `clientId`,
   * for every client. 201 with the reports drafted; 409 when that client's
   * report for the week is already approved.
   */
  @Post()
  async draft(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(reportDraftRequestSchema))
    { clientId }: ReportDraftRequest,
  ): Promise<List<ReportSummary>> {
    const drafted = await this.reports.draft(workspaceId, clientId);
    await this.audit.record(
      workspaceId,
      userId,
      ...drafted.map((report) => ({
        kind: 'change' as const,
        clientId: report.clientId,
        what: `Drafted the weekly report for ${weekOf(report.weekStart)}`,
      })),
    );
    return { data: drafted };
  }

  /** Drafts to review: exceptions first, then clean. */
  @Get('queue')
  async queue(
    @WorkspaceId() workspaceId: string,
  ): Promise<List<ReportSummary>> {
    return { data: await this.reports.queue(workspaceId) };
  }

  /** Sets the status of several reports at once, e.g. "Approve 10 clean". */
  @Post('status')
  @HttpCode(HttpStatus.OK)
  async setStatus(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(bulkReportStatusUpdateSchema))
    { ids, status }: BulkReportStatusUpdate,
  ): Promise<List<ReportSummary>> {
    const changed = await this.reports.setStatus(workspaceId, ids, status);
    await this.audit.record(workspaceId, userId, ...changed.map(statusEvent));
    return { data: changed };
  }

  @Get(':id')
  async get(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<Report> {
    return (
      (await this.db.reports.get(workspaceId, id)) ?? notFound('Report', id)
    );
  }

  @Patch(':id')
  async update(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportStatusUpdateSchema))
    { status }: ReportStatusUpdate,
  ): Promise<ReportSummary> {
    const report = await this.reports.setOneStatus(workspaceId, id, status);
    await this.audit.record(workspaceId, userId, statusEvent(report));
    return report;
  }
}

/** `2026-10-05` → "the week of 5 Oct 2026". */
const weekOf = (weekStart: string) =>
  `the week of ${new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(
    'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
  )}`;

const STATUS_VERBS: Record<ReportStatus, string> = {
  approved: 'Approved',
  skipped: 'Skipped',
  draft: 'Reopened',
};

const statusEvent = (report: ReportSummary): AuditEvent => ({
  kind: 'change',
  clientId: report.clientId,
  what: `${STATUS_VERBS[report.status]} the weekly report for ${weekOf(report.weekStart)}`,
});
