import {
  auditCountsQuerySchema,
  auditQuerySchema,
  hasRole,
  type AuditCount,
  type AuditPage,
  type AuditQuery,
  type List,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { roleIn } from '../auth/roles.js';
import { pageOfLog } from '../common/log-page.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';

/**
 * Reads from tools, sign-ins and changes. Owners and admins see everything;
 * technicians see only reads, which the Connections page counts.
 */
@Controller('audit')
export class AuditController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /**
   * The log, newest first, a page at a time. Each read asks for one entry
   * more than the page, to learn if there are more. Without `kind`,
   * technicians get reads; asking for sign-ins or changes is 403 for them.
   */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Query(new ZodValidationPipe(auditQuerySchema))
    { before, after, limit, ...query }: AuditQuery,
  ): Promise<AuditPage> {
    const filter = (await this.seesEverything(userId, workspaceId))
      ? query
      : { ...query, kind: technicianKind(query.kind) };
    return pageOfLog(
      (window) => this.db.audit.list(workspaceId, { ...filter, ...window }),
      { before, after, limit },
      'That page of the audit log isn’t valid. Start from the newest entries.',
    );
  }

  /** Entries per group, for filtering the log; technicians get reads only. */
  @Get('counts')
  async counts(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Query(new ZodValidationPipe(auditCountsQuerySchema))
    filter: { clientId?: string },
  ): Promise<List<AuditCount>> {
    const counts = await this.db.audit.counts(workspaceId, filter);
    return {
      data: (await this.seesEverything(userId, workspaceId))
        ? counts
        : counts.filter((count) => count.kind === 'read'),
    };
  }

  private async seesEverything(userId: string, workspaceId: string) {
    return hasRole(await roleIn(this.db, userId, workspaceId), 'admin');
  }
}

function technicianKind(kind: AuditQuery['kind']): 'read' {
  if (kind !== undefined && kind !== 'read') {
    throw new ForbiddenException(
      'Only owners and admins can see sign-ins and changes.',
    );
  }
  return 'read';
}
