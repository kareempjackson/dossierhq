import {
  connectorCredentialsSchema,
  meetingAttachmentSchema,
  ninjaOneSignInFinishSchema,
  ninjaOneSignInSchema,
  TOOL_NAMES,
  toolSchema,
  type ConnectionTest,
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
import type { DatabaseAdapter } from '@dossierhq/database';
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
} from '@nestjs/common';
import { RequireRole } from '../auth/role.decorator.js';
import { notFound } from '../common/not-found.js';
import { AuditLog } from '../audit/audit-log.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { SyncService } from './sync.service.js';

const toolParam = new ZodValidationPipe(toolSchema);

@Controller('connectors')
export class ConnectorsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly sync: SyncService,
    private readonly audit: AuditLog,
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
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<Connector> {
    if (credentials.tool !== tool) {
      throw new BadRequestException('The tool in the body must match the URL');
    }
    const name = TOOL_NAMES[tool];
    const existing = await this.db.connectors.get(workspaceId, tool);
    try {
      const connector = await this.sync.connect(workspaceId, credentials);
      await this.audit.record(workspaceId, userId, {
        kind: 'change',
        tool,
        what: existing ? `Changed the ${name} connection` : `Connected ${name}`,
      });
      return connector;
    } catch (error) {
      await this.audit.record(workspaceId, userId, {
        kind: 'change',
        tool,
        what: `Tried to connect ${name}, but it was refused`,
        outcome: 'failed',
      });
      throw error;
    }
  }

  /**
   * Tries credentials from the connect form with the tool, saving nothing.
   * 200 either way: when `ok` is false, `problem` says what it refused. Admins.
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RequireRole('admin', 'change connections')
  async testCredentials(
    @Body(new ZodValidationPipe(connectorCredentialsSchema))
    credentials: ConnectorCredentials,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<ConnectionTest> {
    const result = (await this.sync.test(
      workspaceId,
      credentials.tool,
      credentials,
    ))!;
    await this.recordTest(workspaceId, userId, credentials.tool, result, 'new');
    return result;
  }

  /** Tries the saved credentials with the tool, saving nothing. */
  @Post(':tool/test')
  @HttpCode(HttpStatus.OK)
  async test(
    @Param('tool', toolParam) tool: Tool,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<ConnectionTest> {
    const result =
      (await this.sync.test(workspaceId, tool)) ?? notFound('Connection', tool);
    await this.recordTest(workspaceId, userId, tool, result, 'saved');
    return result;
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
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<Connector> {
    const connector = await this.sync.finishNinjaOneSignIn(workspaceId, finish);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      tool: 'ninjaone',
      what: 'Connected NinjaOne by signing in to it',
    });
    return connector;
  }

  /** Starts a sync now. Answers at once; the connector shows "syncing". */
  @Post(':tool/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async syncNow(
    @Param('tool', toolParam) tool: Tool,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<Connector> {
    const connector =
      (await this.sync.requestSync(workspaceId, tool)) ??
      notFound('Connection', tool);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      tool,
      what: `Started a ${TOOL_NAMES[tool]} sync`,
    });
    return connector;
  }

  /** Forgets the credentials and everything read from the tool. Admins. */
  @Delete(':tool')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole('admin', 'change connections')
  async disconnect(
    @Param('tool', toolParam) tool: Tool,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    if (!(await this.db.connectors.get(workspaceId, tool))) {
      notFound('Connection', tool);
    }
    await this.sync.disconnect(workspaceId, tool);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      tool,
      what: `Disconnected ${TOOL_NAMES[tool]}`,
    });
  }

  private recordTest(
    workspaceId: string,
    userId: string,
    tool: Tool,
    result: ConnectionTest,
    credentials: 'new' | 'saved',
  ) {
    const what =
      credentials === 'new'
        ? `Tested new ${TOOL_NAMES[tool]} credentials`
        : `Tested the ${TOOL_NAMES[tool]} connection`;
    return this.audit.record(workspaceId, userId, {
      kind: 'read',
      tool,
      what: result.ok ? what : `${what}: ${result.problem}`,
      outcome: result.ok ? 'ok' : 'failed',
    });
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
    private readonly audit: AuditLog,
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
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    if (!(await this.db.clients.get(workspaceId, clientId))) {
      notFound('Client', clientId);
    }
    const { unattached, attached } =
      await this.sync.meetingAttachments(workspaceId);
    const title =
      unattached.find((m) => m.id === id)?.title ??
      (await this.db.meetings.list(workspaceId)).find((m) => m.id === id)
        ?.title;
    if (title === undefined && !Object.hasOwn(attached, id)) {
      notFound('Meeting', id);
    }
    if (!(await this.sync.attachMeeting(workspaceId, id, clientId))) {
      notFound('Connection', 'fathom');
    }
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      tool: 'fathom',
      clientId,
      what: title ? `Attached the meeting “${title}”` : 'Attached a meeting',
    });
  }

  /** Undoes attaching a meeting by hand, so matching places it again. */
  @Delete(':id/client')
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach(
    @Param('id') id: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    const { attached } = await this.sync.meetingAttachments(workspaceId);
    if (!Object.hasOwn(attached, id)) notFound('Meeting attached by hand', id);
    const title = (await this.db.meetings.list(workspaceId)).find(
      (m) => m.id === id,
    )?.title;
    if (!(await this.sync.attachMeeting(workspaceId, id, null))) {
      notFound('Connection', 'fathom');
    }
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      tool: 'fathom',
      clientId: attached[id] ?? null,
      what: title
        ? `Detached the meeting “${title}” from its client`
        : 'Detached a meeting from its client',
    });
  }
}
