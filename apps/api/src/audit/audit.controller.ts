import {
  auditCountsQuerySchema,
  auditQuerySchema,
  hasRole,
  type AuditCount,
  type AuditPage,
  type AuditQuery,
  type List,
} from '@dossierhq/contracts';
import type { AuditPosition, DatabaseAdapter } from '@dossierhq/database';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { roleIn } from '../auth/roles.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';

const positionSchema = z.tuple([z.iso.datetime(), z.string().min(1)]);

/** A cursor names the entry a page turns from. */
const cursorAt = (entry: AuditPosition) =>
  Buffer.from(JSON.stringify([entry.at, entry.id])).toString('base64url');

function positionOf(cursor: string): AuditPosition {
  try {
    const [at, id] = positionSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString()),
    );
    return { at, id };
  } catch {
    throw new BadRequestException(
      'That page of the audit log isn’t valid. Start from the newest entries.',
    );
  }
}

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
    if (after !== undefined) {
      const newer = await this.db.audit.list(workspaceId, {
        ...filter,
        after: positionOf(after),
        limit: limit + 1,
      });
      if (newer.length > limit) {
        const data = newer.slice(1);
        return {
          data,
          newer: cursorAt(data[0]!),
          older: cursorAt(data.at(-1)!),
        };
      }
      // Back at the top: show a whole page of the newest instead.
    }
    const position = before === undefined ? undefined : positionOf(before);
    const rows = await this.db.audit.list(workspaceId, {
      ...filter,
      before: position,
      limit: limit + 1,
    });
    const data = rows.slice(0, limit);
    return {
      data,
      newer: position ? cursorAt(data[0] ?? position) : null,
      older: rows.length > limit ? cursorAt(data.at(-1)!) : null,
    };
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
