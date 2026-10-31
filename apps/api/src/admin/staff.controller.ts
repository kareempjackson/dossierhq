import {
  staffAuditQuerySchema,
  staffInviteCreateSchema,
  staffUpdateSchema,
  type Staff as StaffMember,
  type StaffAuditPage,
  type StaffAuditQuery,
  type StaffInvite,
  type StaffInviteCreate,
  type StaffList,
  type StaffUpdate,
} from '@dossierhq/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientIp } from '../common/client-ip.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StaffAudit } from './staff-audit.js';
import { RequireStaffRole, Staff, StaffId } from './staff.decorator.js';
import { StaffService } from './staff.service.js';

const MANAGE = 'manage staff';

/** Who is on the staff: everyone sees it; admins manage it. */
@Staff()
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /** Everyone, by name, and invites not yet accepted. */
  @Get()
  list(): Promise<StaffList> {
    return this.staff.list();
  }

  @RequireStaffRole('admin', MANAGE)
  @Post('invites')
  invite(
    @StaffId() staffId: string,
    @Body(new ZodValidationPipe(staffInviteCreateSchema))
    request: StaffInviteCreate,
    @ClientIp() ip: string | null,
  ): Promise<StaffInvite> {
    return this.staff.invite(staffId, request, ip);
  }

  @RequireStaffRole('admin', MANAGE)
  @Delete('invites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  withdraw(
    @StaffId() staffId: string,
    @Param('id') id: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.staff.withdrawInvite(staffId, id, ip);
  }

  @RequireStaffRole('admin', MANAGE)
  @Patch(':id')
  update(
    @StaffId() staffId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(staffUpdateSchema)) { role }: StaffUpdate,
    @ClientIp() ip: string | null,
  ): Promise<StaffMember> {
    return this.staff.setRole(staffId, id, role, ip);
  }

  /** Takes away their access and ends their sessions; the account stays, for the log. */
  @RequireStaffRole('admin', MANAGE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(
    @StaffId() staffId: string,
    @Param('id') id: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.staff.disable(staffId, id, ip);
  }
}

/** What staff did, newest first; everyone on the staff sees it. */
@Staff()
@Controller('admin/activity')
export class ActivityController {
  constructor(private readonly log: StaffAudit) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(staffAuditQuerySchema))
    query: StaffAuditQuery,
  ): Promise<StaffAuditPage> {
    return this.log.page(query);
  }
}
