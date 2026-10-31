import {
  supportOpenSchema,
  type List,
  type SupportGrant,
  type SupportOpen,
  type SupportOpened,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SupportAccess } from '../auth/support-access.service.js';
import { ClientIp } from '../common/client-ip.js';
import { notFound } from '../common/not-found.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { StaffAudit, type StaffActor } from './staff-audit.js';
import { CurrentStaff, Staff } from './staff.decorator.js';

/**
 * Read-only support views of a workspace, as its owner sees it. Any member
 * of staff may open one, with a reason, for at most an hour; the
 * workspace's own audit log shows when, who and why.
 */
@Staff()
@Controller('admin')
export class SupportController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly support: SupportAccess,
    private readonly log: StaffAudit,
  ) {}

  /** Opens a view; `url` opens it in the customer app, once, within 2 minutes. */
  @Post('workspaces/:id/support')
  async open(
    @CurrentStaff() staff: StaffActor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(supportOpenSchema))
    { reason, minutes }: SupportOpen,
    @ClientIp() ip: string | null,
  ): Promise<SupportOpened> {
    const workspace = await this.db.platform.workspace(id);
    if (!workspace) notFound('Workspace', id);
    const opened = await this.support.open(staff, workspace, reason, minutes);
    await this.log.record(staff, {
      what: `Opened a ${minutes}-minute support view of ${workspace.name}: ${reason}`,
      workspaceId: id,
      ip,
    });
    return opened;
  }

  /** One workspace's views, newest first. */
  @Get('workspaces/:id/support')
  async forWorkspace(@Param('id') id: string): Promise<List<SupportGrant>> {
    return {
      data: await this.support.list({ workspaceId: id, limit: 50 }),
    };
  }

  /** Every view running now, or with `live=0`, the 100 newest. */
  @Get('support')
  async list(@Query('live') live?: string): Promise<List<SupportGrant>> {
    return {
      data: await this.support.list({ live: live !== '0', limit: 100 }),
    };
  }

  @Delete('support/:id')
  async end(
    @CurrentStaff() staff: StaffActor,
    @Param('id') id: string,
    @ClientIp() ip: string | null,
  ): Promise<SupportGrant> {
    const ended = await this.support.end(id, staff);
    await this.log.record(staff, {
      what:
        ended.staff.email === staff.email
          ? `Ended the support view of ${ended.workspaceName}`
          : `Ended ${ended.staff.name}’s support view of ${ended.workspaceName}`,
      workspaceId: ended.workspaceId,
      ip,
    });
    return ended;
  }
}
