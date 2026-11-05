import type { MemoryStatus } from '@dossierhq/contracts';
import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuditLog } from '../audit/audit-log.js';
import { RequireRole } from '../auth/role.decorator.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { MemoryIndexer } from './indexer.js';

@Controller('intelligence/memory')
export class MemoryController {
  constructor(
    private readonly indexer: MemoryIndexer,
    private readonly audit: AuditLog,
  ) {}

  /** What Dossier remembers, and whether it's embedded. Anyone. */
  @Get()
  status(@WorkspaceId() workspaceId: string): Promise<MemoryStatus> {
    return this.indexer.status(workspaceId);
  }

  /**
   * Reads every past record into memory now, rather than a little after each
   * sync. Admins, since embedding costs a little. Answers at once.
   */
  @Post('backfill')
  @HttpCode(202)
  @RequireRole('admin', 'change how Dossier drafts')
  async backfill(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<void> {
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Asked Dossier to read past records into its memory',
    });
    void this.indexer.backfill(workspaceId);
  }
}
