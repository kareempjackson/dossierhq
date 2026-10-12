import {
  bulkReportStatusUpdateSchema,
  reportsQuerySchema,
  reportStatusUpdateSchema,
  type BulkReportStatusUpdate,
  type List,
  type Report,
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
import { notFound } from '../common/not-found.js';
import { WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly reports: ReportsService,
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
    @Body(new ZodValidationPipe(bulkReportStatusUpdateSchema))
    { ids, status }: BulkReportStatusUpdate,
  ): Promise<List<ReportSummary>> {
    return { data: await this.reports.setStatus(workspaceId, ids, status) };
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
  update(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportStatusUpdateSchema))
    { status }: ReportStatusUpdate,
  ): Promise<ReportSummary> {
    return this.reports.setOneStatus(workspaceId, id, status);
  }
}
