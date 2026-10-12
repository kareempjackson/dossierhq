import {
  clientScopedQuerySchema,
  recentClientsQuerySchema,
  sourcesQuerySchema,
  type Client,
  type ClientListItem,
  type Device,
  type List,
  type Meeting,
  type Source,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { notFound } from '../common/not-found.js';
import { WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';

@Controller('clients')
export class ClientsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** By name. */
  @Get()
  async list(@WorkspaceId() workspaceId: string): Promise<List<Client>> {
    return { data: await this.db.clients.list(workspaceId) };
  }

  /** Each client with what's current there, most urgent first. */
  @Get('overview')
  async overview(
    @WorkspaceId() workspaceId: string,
  ): Promise<List<ClientListItem>> {
    return { data: await this.db.clients.overview(workspaceId) };
  }

  /** Most recently opened first. */
  @Get('recent')
  async recent(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(recentClientsQuerySchema))
    { limit }: { limit: number },
  ): Promise<List<Client>> {
    return { data: await this.db.clients.recent(workspaceId, limit) };
  }

  @Get(':id')
  async get(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<Client> {
    return (
      (await this.db.clients.get(workspaceId, id)) ?? notFound('Client', id)
    );
  }

  /**
   * Called when the user opens a client, for "Recent clients". Uses real time,
   * not the pinned demo clock: it records what the person did just now, and
   * views at one pinned instant couldn't be put in order.
   */
  @Post(':id/views')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordView(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<void> {
    const recorded = await this.db.clients.recordView(
      workspaceId,
      id,
      new Date().toISOString(),
    );
    if (!recorded) notFound('Client', id);
  }

  /** Everything Dossier has read about the client, newest first. */
  @Get(':id/sources')
  async sources(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<List<Source>> {
    if (!(await this.db.clients.get(workspaceId, id))) notFound('Client', id);
    return { data: await this.db.sources.listForClient(workspaceId, id) };
  }
}

@Controller('sources')
export class SourcesController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** `?ids=a,b,c`, returned in that order. Unknown IDs are left out. */
  @Get()
  async getMany(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(sourcesQuerySchema))
    { ids }: { ids: string[] },
  ): Promise<List<Source>> {
    return { data: await this.db.sources.getMany(workspaceId, ids) };
  }
}

@Controller('meetings')
export class MeetingsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** Newest first. */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(clientScopedQuerySchema))
    filter: { clientId?: string },
  ): Promise<List<Meeting>> {
    return { data: await this.db.meetings.list(workspaceId, filter) };
  }
}

@Controller('devices')
export class DevicesController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** Devices needing work first. */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(clientScopedQuerySchema))
    filter: { clientId?: string },
  ): Promise<List<Device>> {
    return { data: await this.db.devices.list(workspaceId, filter) };
  }
}
