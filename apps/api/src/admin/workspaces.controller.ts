import {
  auditQuerySchema,
  peopleQuerySchema,
  workspaceDeleteSchema,
  workspaceSuspendSchema,
  workspacesQuerySchema,
  type AuditPage,
  type AuditQuery,
  type List,
  type PeopleQuery,
  type PlatformPerson,
  type WorkspaceDelete,
  type WorkspaceDetail,
  type WorkspacePage,
  type WorkspaceSuspend,
  type WorkspacesQuery,
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
import { ClientIp } from '../common/client-ip.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PlatformService } from './platform.service.js';
import type { StaffActor } from './staff-audit.js';
import { CurrentStaff, RequireStaffRole, Staff } from './staff.decorator.js';

/** Every workspace: support staff look, admins suspend, restore and delete. */
@Staff()
@Controller('admin/workspaces')
export class WorkspacesController {
  constructor(private readonly platform: PlatformService) {}

  /** Newest first, 50 a page; `q` searches names, IDs and members' emails. */
  @Get()
  list(
    @Query(new ZodValidationPipe(workspacesQuerySchema))
    query: WorkspacesQuery,
  ): Promise<WorkspacePage> {
    return this.platform.workspaces(query);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<WorkspaceDetail> {
    return this.platform.workspace(id);
  }

  /** Its own audit log, everything in it, as its owners see it. */
  @Get(':id/audit')
  audit(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
  ): Promise<AuditPage> {
    return this.platform.auditLog(id, query);
  }

  @RequireStaffRole('admin', 'suspend workspaces')
  @Post(':id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspend(
    @CurrentStaff() staff: StaffActor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(workspaceSuspendSchema))
    { reason }: WorkspaceSuspend,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.platform.suspend(staff, id, reason, ip);
  }

  @RequireStaffRole('admin', 'restore workspaces')
  @Post(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  restore(
    @CurrentStaff() staff: StaffActor,
    @Param('id') id: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.platform.restore(staff, id, ip);
  }

  /** Only a suspended workspace, with its name typed out. */
  @RequireStaffRole('admin', 'delete workspaces')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentStaff() staff: StaffActor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(workspaceDeleteSchema))
    { confirmName }: WorkspaceDelete,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.platform.remove(staff, id, confirmName, ip);
  }
}

/** Everyone with a Dossier account, and helping them sign in. */
@Staff()
@Controller('admin/people')
export class PeopleController {
  constructor(private readonly platform: PlatformService) {}

  /** By name, at most 50; `q` searches names and emails. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(peopleQuerySchema)) { q }: PeopleQuery,
  ): Promise<List<PlatformPerson>> {
    return { data: await this.platform.people(q) };
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<PlatformPerson> {
    return this.platform.person(id);
  }

  @RequireStaffRole('admin', 'sign people out')
  @Post(':id/sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(
    @CurrentStaff() staff: StaffActor,
    @Param('id') id: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.platform.signOut(staff, id, ip);
  }

  @RequireStaffRole('admin', 'send password reset links')
  @Post(':id/password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  passwordReset(
    @CurrentStaff() staff: StaffActor,
    @Param('id') id: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.platform.sendPasswordReset(staff, id, ip);
  }

  @RequireStaffRole('admin', 'turn off two-factor sign-in')
  @Delete(':id/two-factor')
  @HttpCode(HttpStatus.NO_CONTENT)
  turnOffTwoFactor(
    @CurrentStaff() staff: StaffActor,
    @Param('id') id: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.platform.turnOffTwoFactor(staff, id, ip);
  }
}
