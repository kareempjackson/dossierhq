import {
  clientScopedQuerySchema,
  recommendationsQuerySchema,
  recommendationUpdateSchema,
  type AttentionItem,
  type Commitment,
  type List,
  type Recommendation,
  type RecommendationStatus,
  type RecommendationUpdate,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { notFound } from '../common/not-found.js';
import { WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { RecommendationsService } from './recommendations.service.js';

@Controller('attention')
export class AttentionController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** Most urgent first, then newest. */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(clientScopedQuerySchema))
    filter: { clientId?: string },
  ): Promise<List<AttentionItem>> {
    return { data: await this.db.attention.list(workspaceId, filter) };
  }
}

@Controller('recommendations')
export class RecommendationsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly recommendations: RecommendationsService,
  ) {}

  /** Newest first. */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(recommendationsQuerySchema))
    filter: { clientId?: string; status?: RecommendationStatus },
  ): Promise<List<Recommendation>> {
    return { data: await this.db.recommendations.list(workspaceId, filter) };
  }

  @Get(':id')
  async get(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<Recommendation> {
    return (
      (await this.db.recommendations.get(workspaceId, id)) ??
      notFound('Recommendation', id)
    );
  }

  /** Accept, dismiss, undo (back to draft) or edit the wording. */
  @Patch(':id')
  update(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recommendationUpdateSchema))
    update: RecommendationUpdate,
  ): Promise<Recommendation> {
    return this.recommendations.update(workspaceId, id, update);
  }
}

@Controller('commitments')
export class CommitmentsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** Open first (soonest due), then done (most recent). */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(clientScopedQuerySchema))
    filter: { clientId?: string },
  ): Promise<List<Commitment>> {
    return { data: await this.db.commitments.list(workspaceId, filter) };
  }
}
