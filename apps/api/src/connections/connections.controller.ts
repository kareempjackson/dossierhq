import {
  auditQuerySchema,
  type AuditEntry,
  type Connector,
  type List,
  type Tool,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';

@Controller('connectors')
export class ConnectorsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  @Get()
  async list(@WorkspaceId() workspaceId: string): Promise<List<Connector>> {
    return { data: await this.db.connectors.list(workspaceId) };
  }
}

@Controller('audit')
export class AuditController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** Every read Dossier made from a tool, newest first. */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(auditQuerySchema))
    filter: { clientId?: string; tool?: Tool },
  ): Promise<List<AuditEntry>> {
    return { data: await this.db.audit.list(workspaceId, filter) };
  }
}
