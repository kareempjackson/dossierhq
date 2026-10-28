import {
  auditCountsQuerySchema,
  auditQuerySchema,
  connectorCredentialsSchema,
  meetingAttachmentSchema,
  ninjaOneSignInFinishSchema,
  ninjaOneSignInSchema,
  toolSchema,
  type AuditCount,
  type AuditPage,
  type AuditQuery,
  type Connector,
  type ConnectorCredentials,
  type List,
  type MeetingAttachment,
  type MeetingAttachments,
  type NinjaOneSignIn,
  type NinjaOneSignInFinish,
  type NinjaOneSignInStart,
  type Tool,
} from '@dossierhq/contracts';
import type { AuditPosition, DatabaseAdapter } from '@dossierhq/database';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { RequireRole } from '../auth/role.decorator.js';
import { notFound } from '../common/not-found.js';
import { WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { SyncService } from './sync.service.js';

const toolParam = new ZodValidationPipe(toolSchema);

@Controller('connectors')
export class ConnectorsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly sync: SyncService,
  ) {}

  /** The connected tools. Credentials never leave the API. */
  @Get()
  async list(@WorkspaceId() workspaceId: string): Promise<List<Connector>> {
    return { data: await this.db.connectors.list(workspaceId) };
  }

  /**
   * Connects a tool, or replaces its credentials. Checks them with the tool
   * first: 422 with its problem in plain words if they don't work. Admins.
   */
  @Put(':tool')
  @RequireRole('admin', 'change connections')
  async connect(
    @Param('tool', toolParam) tool: Tool,
    @Body(new ZodValidationPipe(connectorCredentialsSchema))
    credentials: ConnectorCredentials,
    @WorkspaceId() workspaceId: string,
  ): Promise<Connector> {
    if (credentials.tool !== tool) {
      throw new BadRequestException('The tool in the body must match the URL');
    }
    return this.sync.connect(workspaceId, credentials);
  }

  /**
   * Starts signing in with NinjaOne, which tickets need: where to send the
   * person, and sealed details to hand back when they return. Admins.
   */
  @Post('ninjaone/sign-in')
  @HttpCode(HttpStatus.OK)
  @RequireRole('admin', 'change connections')
  async startNinjaOneSignIn(
    @Body(new ZodValidationPipe(ninjaOneSignInSchema)) app: NinjaOneSignIn,
    @WorkspaceId() workspaceId: string,
  ): Promise<NinjaOneSignInStart> {
    return this.sync.startNinjaOneSignIn(workspaceId, app);
  }

  /**
   * Finishes it with what NinjaOne sent back, then connects and syncs like
   * PUT does. 400 when the sign-in is stale or began elsewhere. Admins.
   */
  @Post('ninjaone/sign-in/finish')
  @RequireRole('admin', 'change connections')
  async finishNinjaOneSignIn(
    @Body(new ZodValidationPipe(ninjaOneSignInFinishSchema))
    finish: NinjaOneSignInFinish,
    @WorkspaceId() workspaceId: string,
  ): Promise<Connector> {
    return this.sync.finishNinjaOneSignIn(workspaceId, finish);
  }

  /** Starts a sync now. Answers at once; the connector shows "syncing". */
  @Post(':tool/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncNow(
    @Param('tool', toolParam) tool: Tool,
    @WorkspaceId() workspaceId: string,
  ): Promise<Connector> {
    return (
      (await this.sync.requestSync(workspaceId, tool)) ??
      notFound('Connection', tool)
    );
  }

  /** Forgets the credentials and everything read from the tool. Admins. */
  @Delete(':tool')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('admin', 'change connections')
  async disconnect(
    @Param('tool', toolParam) tool: Tool,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    if (!(await this.db.connectors.get(workspaceId, tool))) {
      notFound('Connection', tool);
    }
    await this.sync.disconnect(workspaceId, tool);
  }
}

/**
 * Attaching recorded meetings to clients by hand, for the ones matching by
 * domain gets wrong or can't place. An attachment lasts through later syncs.
 */
@Controller('meetings')
export class MeetingAttachmentsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly sync: SyncService,
  ) {}

  /** Meetings no client matched, and the ones attached by hand. */
  @Get('attachments')
  attachments(@WorkspaceId() workspaceId: string): Promise<MeetingAttachments> {
    return this.sync.meetingAttachments(workspaceId);
  }

  /**
   * Attaches a meeting to a client. Answers once Fathom has synced it
   * there, or after a few seconds while that sync carries on.
   */
  @Put(':id/client')
  @HttpCode(HttpStatus.NO_CONTENT)
  async attach(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(meetingAttachmentSchema))
    { clientId }: MeetingAttachment,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    if (!(await this.db.clients.get(workspaceId, clientId))) {
      notFound('Client', clientId);
    }
    const { unattached, attached } =
      await this.sync.meetingAttachments(workspaceId);
    const known =
      unattached.some((m) => m.id === id) ||
      Object.hasOwn(attached, id) ||
      (await this.db.meetings.list(workspaceId)).some((m) => m.id === id);
    if (!known) notFound('Meeting', id);
    if (!(await this.sync.attachMeeting(workspaceId, id, clientId))) {
      notFound('Connection', 'fathom');
    }
  }

  /** Undoes attaching a meeting by hand, so matching places it again. */
  @Delete(':id/client')
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach(
    @Param('id') id: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    const { attached } = await this.sync.meetingAttachments(workspaceId);
    if (!Object.hasOwn(attached, id)) notFound('Meeting attached by hand', id);
    if (!(await this.sync.attachMeeting(workspaceId, id, null))) {
      notFound('Connection', 'fathom');
    }
  }
}

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
      'That page of the audit log isn’t valid. Start from the newest reads.',
    );
  }
}

@Controller('audit')
export class AuditController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /**
   * Every read Dossier made from a tool, newest first, a page at a time. Each
   * read asks for one entry more than the page, to learn if there are more.
   */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(auditQuerySchema))
    { before, after, limit, ...filter }: AuditQuery,
  ): Promise<AuditPage> {
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

  /** How many reads each tool has, for filtering the log. */
  @Get('counts')
  async counts(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(auditCountsQuerySchema))
    filter: { clientId?: string },
  ): Promise<List<AuditCount>> {
    return { data: await this.db.audit.counts(workspaceId, filter) };
  }
}
