import {
  progressQuerySchema,
  type Progress,
  type ProgressWatch,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { MemoryIndexer } from '../memory/indexer.js';

/**
 * Where work a page is waiting on stands: a few bytes, asked every few
 * seconds while a sync runs, so the page itself is only drawn again when
 * something changed.
 */
@Controller('progress')
export class ProgressController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly memory: MemoryIndexer,
  ) {}

  @Get()
  async progress(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(progressQuerySchema))
    query: { watch: ProgressWatch; id?: string },
  ): Promise<Progress> {
    switch (query.watch) {
      case 'tools': {
        const tools = await this.db.connectors.list(workspaceId);
        return {
          busy: tools.some((tool) => tool.status === 'syncing'),
          stamp: tools
            .map((t) => `${t.tool}:${t.status}:${t.lastSyncAt ?? ''}`)
            .join('|'),
        };
      }
      case 'memory': {
        const status = await this.memory.status(workspaceId);
        return {
          busy: status.backfilling,
          stamp: `${status.backfilling}:${status.documents}:${status.chunks}:${status.embedded}`,
        };
      }
      case 'ask': {
        const answer = query.id
          ? await this.db.ask.get(workspaceId, query.id)
          : null;
        return {
          busy: answer?.status === 'answering',
          stamp: answer?.status ?? 'none',
        };
      }
    }
  }
}
