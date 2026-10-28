import {
  intelligencePreferencesSchema,
  intelligenceUpdateSchema,
  type IntelligencePreferences,
  type IntelligenceSettings,
  type IntelligenceUpdate,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { IntelligenceService } from './intelligence.service.js';
import { IntelligenceScheduler } from './scheduler.js';

@Controller('intelligence')
export class IntelligenceController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
    private readonly scheduler: IntelligenceScheduler,
  ) {}

  /** Which model drafts for this workspace, and what drafting has cost. */
  @Get()
  get(@WorkspaceId() workspaceId: string): Promise<IntelligenceSettings> {
    return this.intelligence.settings(workspaceId);
  }

  /** Chooses the model; null goes back to the default. Owner only. */
  @Put()
  async update(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(intelligenceUpdateSchema))
    update: IntelligenceUpdate,
  ): Promise<IntelligenceSettings> {
    await this.requireOwner(userId, workspaceId);
    await this.intelligence.setModel(workspaceId, update.model);
    return this.intelligence.settings(workspaceId);
  }

  /**
   * What Dossier drafts, what it looks for and what Claude may read. Takes
   * all three groups; any switch left out is on. Owner only.
   */
  @Put('preferences')
  async setPreferences(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(intelligencePreferencesSchema))
    preferences: IntelligencePreferences,
  ): Promise<IntelligenceSettings> {
    await this.requireOwner(userId, workspaceId);
    await this.intelligence.setPreferences(workspaceId, preferences);
    return this.intelligence.settings(workspaceId);
  }

  /**
   * Drafts recommendations for every client now, even where nothing changed.
   * Owner only, since it spends money. Answers at once; drafts follow.
   */
  @Post('draft')
  @HttpCode(202)
  async draft(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<void> {
    await this.requireOwner(userId, workspaceId);
    if (!this.intelligence.enabled) {
      throw new ServiceUnavailableException(
        'Drafting with Claude is off. Set ANTHROPIC_API_KEY on the API to turn it on.',
      );
    }
    if (!(await this.intelligence.isOn(workspaceId, 'recommendations'))) {
      throw new ConflictException(
        'Recommendations are turned off on the Intelligence page.',
      );
    }
    void this.scheduler.now(workspaceId, { force: true });
  }

  private async requireOwner(userId: string, workspaceId: string) {
    const memberships = await this.db.users.memberships(userId);
    const role = memberships.find((m) => m.workspaceId === workspaceId)?.role;
    if (role !== 'owner') {
      throw new ForbiddenException(
        'Only the workspace owner can change how Dossier drafts.',
      );
    }
  }
}
