import {
  intelligencePreferencesSchema,
  modelInfo,
  intelligenceUpdateSchema,
  type IntelligencePreferences,
  type IntelligenceSettings,
  type IntelligenceUpdate,
} from '@dossierhq/contracts';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RequireRole } from '../auth/role.decorator.js';
import { AuditLog } from '../audit/audit-log.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { IntelligenceService } from './intelligence.service.js';
import { IntelligenceScheduler } from './scheduler.js';

@Controller('intelligence')
export class IntelligenceController {
  constructor(
    private readonly audit: AuditLog,
    private readonly intelligence: IntelligenceService,
    private readonly scheduler: IntelligenceScheduler,
  ) {}

  /** Which model drafts for this workspace, and what drafting has cost. */
  @Get()
  get(@WorkspaceId() workspaceId: string): Promise<IntelligenceSettings> {
    return this.intelligence.settings(workspaceId);
  }

  /** Chooses the model; null goes back to the default. Admins. */
  @Put()
  @RequireRole('admin', 'change how Dossier drafts')
  async update(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(intelligenceUpdateSchema))
    update: IntelligenceUpdate,
  ): Promise<IntelligenceSettings> {
    await this.intelligence.setModel(workspaceId, update.model);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: update.model
        ? `Chose ${modelInfo(update.model).name} for drafting`
        : 'Went back to the default model for drafting',
    });
    return this.intelligence.settings(workspaceId);
  }

  /**
   * What Dossier drafts, what it looks for and what Claude may read. Takes
   * all three groups; any switch left out is on. Admins.
   */
  @Put('preferences')
  @RequireRole('admin', 'change how Dossier drafts')
  async setPreferences(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(intelligencePreferencesSchema))
    preferences: IntelligencePreferences,
  ): Promise<IntelligenceSettings> {
    await this.intelligence.setPreferences(workspaceId, preferences);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Changed what Dossier drafts, looks for and may read',
    });
    return this.intelligence.settings(workspaceId);
  }

  /**
   * Drafts recommendations for every client now, even where nothing changed.
   * Admins, since it spends money. Answers at once; drafts follow.
   */
  @Post('draft')
  @HttpCode(202)
  @RequireRole('admin', 'change how Dossier drafts')
  async draft(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<void> {
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
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Asked for new recommendations for every client',
    });
    void this.scheduler.now(workspaceId, { force: true });
  }
}
