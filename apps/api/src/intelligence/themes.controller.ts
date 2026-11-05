import type { ClientTheme, List } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Controller, Get, Inject, Param } from '@nestjs/common';
import { WorkspaceId } from '../common/workspace.js';
import { DATABASE } from '../database/database.module.js';
import { IntelligenceService } from './intelligence.service.js';

@Controller('clients')
export class ThemesController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
  ) {}

  /** What keeps coming back at a client; empty while it's off or tickets aren't shared. */
  @Get(':id/themes')
  async list(
    @WorkspaceId() workspaceId: string,
    @Param('id') clientId: string,
  ): Promise<List<ClientTheme>> {
    const { outputs, records } =
      await this.intelligence.preferences(workspaceId);
    if (!outputs.recurringIssues || !records.tickets) return { data: [] };
    const themes = await this.db.themes.list(workspaceId, { clientId });
    return {
      data: themes.filter((t) => records.ticketNotes || !t.withInternal),
    };
  }
}
