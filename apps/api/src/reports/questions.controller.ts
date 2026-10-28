import {
  clientScopedQuerySchema,
  reportQuestionCreateSchema,
  reportQuestionUpdateSchema,
  type List,
  type ReportQuestion,
  type ReportQuestionCreate,
  type ReportQuestionUpdate,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Clock } from '../common/clock.js';
import { notFound } from '../common/not-found.js';
import { WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';

let lastStamp = 0;

/**
 * Sorts after every ID made before it, so questions asked at the same moment
 * (always, on a pinned clock) still list in the order they were asked.
 */
function questionId(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return `rq-${lastStamp.toString(36).padStart(9, '0')}-${randomUUID().slice(0, 8)}`;
}

/**
 * Questions the weekly reports answer, for every client or for one. Dossier
 * answers them from each client's records when it drafts the report.
 */
@Controller('report-questions')
export class ReportQuestionsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly clock: Clock,
  ) {}

  /** Oldest first. With `clientId`, that client's and everyone's. */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(clientScopedQuerySchema))
    filter: { clientId?: string },
  ): Promise<List<ReportQuestion>> {
    return { data: await this.db.reportQuestions.list(workspaceId, filter) };
  }

  @Post()
  async create(
    @WorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(reportQuestionCreateSchema))
    { text, clientId }: ReportQuestionCreate,
  ): Promise<ReportQuestion> {
    await this.requireClient(workspaceId, clientId);
    const question: ReportQuestion = {
      id: questionId(),
      clientId,
      text,
      createdAt: this.clock.now(),
    };
    await this.db.reportQuestions.create(workspaceId, question);
    return question;
  }

  @Patch(':id')
  async update(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportQuestionUpdateSchema))
    changes: ReportQuestionUpdate,
  ): Promise<ReportQuestion> {
    await this.requireClient(workspaceId, changes.clientId ?? null);
    return (
      (await this.db.reportQuestions.update(workspaceId, id, changes)) ??
      notFound('Question', id)
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<void> {
    if (!(await this.db.reportQuestions.remove(workspaceId, id))) {
      notFound('Question', id);
    }
  }

  /** A question for one client needs that client to be in this workspace. */
  private async requireClient(workspaceId: string, clientId: string | null) {
    if (
      clientId !== null &&
      !(await this.db.clients.get(workspaceId, clientId))
    ) {
      notFound('Client', clientId);
    }
  }
}
