import {
  auditQuerySchema,
  connectorCredentialsSchema,
  toolSchema,
  type AuditEntry,
  type Connector,
  type ConnectorCredentials,
  type List,
  type Tool,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { notFound } from '../common/not-found.js';
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
  ) {}

  /** The connected tools. Credentials never leave the API. */
  @Get()
  async list(@WorkspaceId() workspaceId: string): Promise<List<Connector>> {
    return { data: await this.db.connectors.list(workspaceId) };
  }

  /**
   * Connects a tool, or replaces its credentials. Checks them with the tool
   * first: 422 with its problem in plain words if they don't work. Owners only.
   */
  @Put(':tool')
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
    await this.requireOwner(userId, workspaceId);
    return this.sync.connect(workspaceId, credentials);
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

  /** Forgets the credentials and everything read from the tool. Owners only. */
  @Delete(':tool')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(
    @Param('tool', toolParam) tool: Tool,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    await this.requireOwner(userId, workspaceId);
    if (!(await this.db.connectors.get(workspaceId, tool))) {
      notFound('Connection', tool);
    }
    await this.sync.disconnect(workspaceId, tool);
  }

  private async requireOwner(userId: string, workspaceId: string) {
    const memberships = await this.db.users.memberships(userId);
    const role = memberships.find((m) => m.workspaceId === workspaceId)?.role;
    if (role !== 'owner') {
      throw new ForbiddenException(
        'Only the workspace owner can change connections.',
      );
    }
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
