import {
  newMeetingNoteSchema,
  noteFilingSchema,
  notesQuerySchema,
  type List,
  type MeetingNote,
  type NoteFiling,
  type NotesInbox,
} from '@dossierhq/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { z } from 'zod';
import { Public } from '../auth/public.decorator.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AppConfig, InboundConfig } from '../config/configuration.js';
import { postmarkInboundSchema, webhookAuthorized } from './inbound-email.js';
import { NotesService } from './notes.service.js';

/** Meeting notes people add, and the inbox of ones no client claims. */
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  /** One client's notes, newest meeting first. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(notesQuerySchema))
    { clientId }: z.infer<typeof notesQuerySchema>,
    @WorkspaceId() workspaceId: string,
  ): Promise<List<MeetingNote>> {
    return { data: await this.notes.list(workspaceId, clientId) };
  }

  /** Notes waiting for a client, and the workspace's forwarding address. */
  @Get('inbox')
  inbox(@WorkspaceId() workspaceId: string): Promise<NotesInbox> {
    return this.notes.inbox(workspaceId);
  }

  /** Adds notes, filed with `clientId` or left in the inbox. */
  @Post()
  add(
    @Body(new ZodValidationPipe(newMeetingNoteSchema))
    note: z.output<typeof newMeetingNoteSchema>,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<MeetingNote> {
    return this.notes.add(workspaceId, userId, note);
  }

  /** Files notes with a client, or with null puts them back in the inbox. */
  @Patch(':id')
  file(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(noteFilingSchema)) { clientId }: NoteFiling,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<MeetingNote> {
    return this.notes.file(workspaceId, userId, id, clientId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    return this.notes.remove(workspaceId, userId, id);
  }
}

/**
 * Email Postmark received for a workspace's notes address. Public, but only
 * with the webhook's token; 200 for anything it read, used or not, so
 * Postmark doesn't send it again.
 */
@Controller('inbound')
export class InboundController {
  private readonly inbound: InboundConfig | null;

  constructor(
    private readonly notes: NotesService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.inbound = config.get('inbound', { infer: true });
  }

  @Public()
  @Post('postmark')
  @HttpCode(HttpStatus.OK)
  async postmark(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<{ status: 'added' | 'ignored' }> {
    if (!this.inbound) {
      throw new NotFoundException('Forwarding notes by email isn’t set up');
    }
    if (!webhookAuthorized(authorization, this.inbound.token)) {
      throw new UnauthorizedException();
    }
    const email = postmarkInboundSchema.safeParse(body);
    if (!email.success) {
      throw new BadRequestException('That isn’t an email from Postmark');
    }
    return { status: await this.notes.receive(email.data) };
  }
}
