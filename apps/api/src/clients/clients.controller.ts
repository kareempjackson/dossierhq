import {
  intelligencePreferencesSchema,
  clientScopedQuerySchema,
  recentClientsQuerySchema,
  sourcesQuerySchema,
  type Client,
  type ClientListItem,
  type Device,
  type EndUser,
  type EndUserDetail,
  type List,
  type Meeting,
  type Source,
  type Ticket,
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
import { endUserDetail, findEndUsers } from './end-users.js';

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

  /**
   * One of its tickets by its number in its tool, with everything written on
   * it: its email thread, replies and notes, oldest first.
   */
  @Get(':id/tickets/:number')
  async ticket(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('number') number: string,
  ): Promise<Ticket> {
    return (
      (await this.db.tickets.get(workspaceId, id, number)) ??
      notFound('Ticket', number)
    );
  }

  /** The people who work there, as the tools name them; by name. */
  @Get(':id/users')
  async users(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
  ): Promise<List<EndUser>> {
    const found = await this.endUsers(workspaceId, id);
    return { data: found.map(({ user }) => user) };
  }

  /** One of them, with their devices, tickets, meetings and what they said. */
  @Get(':id/users/:userId')
  async user(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<EndUserDetail> {
    const found =
      (await this.endUsers(workspaceId, id)).find(
        ({ user }) => user.id === userId,
      ) ?? notFound('User', userId);
    const cited = found.meetings.flatMap((meeting) =>
      [...meeting.planning, ...meeting.concerns, ...meeting.askedFor].flatMap(
        (point) => point.sourceIds,
      ),
    );
    const [sources, attention, preferences] = await Promise.all([
      this.db.sources.getMany(workspaceId, [...new Set(cited)]),
      this.db.attention.list(workspaceId, { clientId: id }),
      this.db.intelligence.preferences(workspaceId),
    ]);
    const wanted =
      intelligencePreferencesSchema.safeParse(preferences).data?.outputs
        .peopleProfiles ?? true;
    return {
      ...endUserDetail(found, sources, attention),
      profile: wanted
        ? await this.db.personInsights.get(workspaceId, id, userId)
        : null,
    };
  }

  private async endUsers(workspaceId: string, clientId: string) {
    const client =
      (await this.db.clients.get(workspaceId, clientId)) ??
      notFound('Client', clientId);
    const [devices, tickets, meetings, notes, members] = await Promise.all([
      this.db.devices.list(workspaceId, { clientId }),
      this.db.tickets.list(workspaceId, { clientId }),
      this.db.meetings.list(workspaceId, { clientId }),
      this.db.notes.list(workspaceId, clientId),
      this.db.users.members(workspaceId),
    ]);
    return findEndUsers({
      client,
      devices,
      tickets,
      meetings,
      notes,
      staffEmails: members.map((member) => member.email),
    });
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

@Controller('tickets')
export class TicketsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /**
   * Open first (most urgent, then most recently updated), then closed, with
   * who's on each and what's written on it.
   */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @Query(new ZodValidationPipe(clientScopedQuerySchema))
    filter: { clientId?: string },
  ): Promise<List<Ticket>> {
    return { data: await this.db.tickets.list(workspaceId, filter) };
  }
}
