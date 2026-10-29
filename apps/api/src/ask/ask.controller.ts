import {
  askHistoryQuerySchema,
  newQuestionSchema,
  type AskAnswer,
  type AskSummary,
  type List,
  type NewQuestion,
} from '@dossierhq/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { z } from 'zod';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AskService } from './ask.service.js';

/** The Ask box: questions answered across the workspace, kept for everyone. */
@Controller('ask')
export class AskController {
  constructor(private readonly ask: AskService) {}

  /**
   * Asks a question. Answers at once with the question, while Dossier is
   * still answering; GET /ask/:id until it says answered or failed.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Body(new ZodValidationPipe(newQuestionSchema))
    { question }: Required<NewQuestion>,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<AskAnswer> {
    return this.ask.ask(workspaceId, userId, question);
  }

  /** Questions asked here, newest first. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(askHistoryQuerySchema))
    query: z.output<typeof askHistoryQuerySchema>,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<List<AskSummary>> {
    return { data: await this.ask.list(workspaceId, userId, query) };
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<AskAnswer> {
    return this.ask.get(workspaceId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    return this.ask.remove(workspaceId, userId, id);
  }
}
