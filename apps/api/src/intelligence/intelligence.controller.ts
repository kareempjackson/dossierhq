import {
  intelligenceKeyUpdateSchema,
  intelligencePreferencesSchema,
  modelInfo,
  intelligenceUpdateSchema,
  providerIdSchema,
  providerInfo,
  type IntelligenceKeyUpdate,
  type IntelligenceOutput,
  type IntelligencePreferences,
  type IntelligenceSettings,
  type IntelligenceUpdate,
  type List,
  type Pattern,
  type ProviderId,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RequireRole } from '../auth/role.decorator.js';
import { AuditLog } from '../audit/audit-log.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { IntelligenceService, turnedOff } from './intelligence.service.js';
import { PatternFinder } from './patterns.js';
import { IntelligenceScheduler } from './scheduler.js';

const providerParam = new ZodValidationPipe(providerIdSchema);

@Controller('intelligence')
export class IntelligenceController {
  constructor(
    private readonly audit: AuditLog,
    private readonly intelligence: IntelligenceService,
    private readonly scheduler: IntelligenceScheduler,
    private readonly patterns: PatternFinder,
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
   * Keeps the workspace's own API key for a provider, once the provider
   * takes it, in place of any it had. Its models then run on it, billed to
   * the workspace. 422 when the provider turns it down. Admins.
   */
  @Put('keys/:provider')
  @RequireRole('admin', 'change how Dossier drafts')
  async addKey(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('provider', providerParam) provider: ProviderId,
    @Body(new ZodValidationPipe(intelligenceKeyUpdateSchema))
    update: IntelligenceKeyUpdate,
  ): Promise<IntelligenceSettings> {
    const { switchedTo } = await this.intelligence.addKey(
      workspaceId,
      userId,
      provider,
      update.key,
    );
    const { name } = providerInfo(provider);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: switchedTo
        ? `Added the workspace’s ${name} API key and chose ${modelInfo(switchedTo).name} for drafting`
        : `Added the workspace’s ${name} API key for drafting`,
    });
    return this.intelligence.settings(workspaceId);
  }

  /** Forgets the workspace's key for a provider. Admins. */
  @Delete('keys/:provider')
  @RequireRole('admin', 'change how Dossier drafts')
  async removeKey(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Param('provider', providerParam) provider: ProviderId,
  ): Promise<IntelligenceSettings> {
    if (await this.intelligence.removeKey(workspaceId, provider)) {
      await this.audit.record(workspaceId, userId, {
        kind: 'change',
        what: `Removed the workspace’s ${providerInfo(provider).name} API key`,
      });
    }
    return this.intelligence.settings(workspaceId);
  }

  /**
   * What Dossier drafts, what it looks for and what the model may read. Takes
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
    await this.requireOn(workspaceId, 'recommendations');
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Asked for new recommendations for every client',
    });
    void this.scheduler.now(workspaceId, { force: true });
  }

  /**
   * Looks for patterns across clients now, even where nothing changed.
   * Admins, since it spends money. Answers at once; patterns follow.
   */
  @Post('patterns')
  @HttpCode(202)
  @RequireRole('admin', 'change how Dossier drafts')
  async findPatterns(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<void> {
    await this.requireOn(workspaceId, 'patterns');
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Asked Dossier to look for patterns across clients',
    });
    void this.patterns.find(workspaceId, { force: true }).catch(() => {});
  }

  /** 503 without a key, 409 when the output is turned off. */
  private async requireOn(workspaceId: string, output: IntelligenceOutput) {
    const off = await this.intelligence.off(workspaceId);
    if (off) throw new ServiceUnavailableException(off);
    if (!(await this.intelligence.isOn(workspaceId, output))) {
      throw new ConflictException(turnedOff(output));
    }
  }
}

/** What several clients have in common, as Dossier last found it. */
@Controller('patterns')
export class PatternsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
  ) {}

  /** Most important first; none while patterns are turned off. */
  @Get()
  async list(@WorkspaceId() workspaceId: string): Promise<List<Pattern>> {
    if (!(await this.intelligence.isOn(workspaceId, 'patterns'))) {
      return { data: [] };
    }
    const [patterns, clients] = await Promise.all([
      this.db.patterns.list(workspaceId),
      this.db.clients.list(workspaceId),
    ]);
    // A client removed since takes its part of a pattern with it, and a
    // pattern left with one client is no pattern.
    const current = new Set(clients.map((client) => client.id));
    return {
      data: patterns
        .map((p) => ({
          ...p,
          clients: p.clients.filter((c) => current.has(c.clientId)),
        }))
        .filter((p) => p.clients.length >= 2),
    };
  }
}
