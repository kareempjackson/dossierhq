import {
  inviteCreateSchema,
  memberUpdateSchema,
  type Invite,
  type InviteCreate,
  type List,
  type Member,
  type MemberUpdate,
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
} from '@nestjs/common';
import { RequireRole } from '../auth/role.decorator.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MembersService } from './members.service.js';

const MANAGE = 'manage people';

/** People in the workspace: everyone sees them; owners and admins manage them. */
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /** Everyone in the workspace, by name. */
  @Get()
  async list(@WorkspaceId() workspaceId: string): Promise<List<Member>> {
    return { data: await this.members.members(workspaceId) };
  }

  /** Invites not yet accepted, newest first. */
  @Get('invites')
  @RequireRole('admin', MANAGE)
  async invites(@WorkspaceId() workspaceId: string): Promise<List<Invite>> {
    return { data: await this.members.invites(workspaceId) };
  }

  @Post('invites')
  @RequireRole('admin', MANAGE)
  invite(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(inviteCreateSchema)) invite: InviteCreate,
  ): Promise<Invite> {
    return this.members.invite(workspaceId, userId, invite);
  }

  @Delete('invites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('admin', MANAGE)
  withdraw(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.members.withdraw(workspaceId, userId, id);
  }

  /** 403 when an admin touches an owner; 409 for the last owner. */
  @Patch(':userId')
  @RequireRole('admin', MANAGE)
  setRole(
    @WorkspaceId() workspaceId: string,
    @UserId() actorId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(memberUpdateSchema)) { role }: MemberUpdate,
  ): Promise<Member> {
    return this.members.setRole(workspaceId, actorId, userId, role);
  }

  /** Removes them, with their account. Same rules as changing a role. */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('admin', MANAGE)
  remove(
    @WorkspaceId() workspaceId: string,
    @UserId() actorId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.members.remove(workspaceId, actorId, userId);
  }
}
