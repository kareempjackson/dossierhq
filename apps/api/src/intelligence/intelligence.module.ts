import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { WorkspaceDigests } from './digest.js';
import {
  IntelligenceController,
  PatternsController,
} from './intelligence.controller.js';
import { IntelligenceService } from './intelligence.service.js';
import { MeetingPointsExtractor } from './meeting-points.js';
import { ClaudeModel, INTELLIGENCE_MODEL } from './model.js';
import { MODEL_CLIENTS, ProviderClients } from './model-clients.js';
import { ContextPacks } from './pack.js';
import { PatternFinder } from './patterns.js';
import { RecommendationDrafter } from './recommendations.js';
import {
  DEFAULT_INTELLIGENCE_OPTIONS,
  INTELLIGENCE_OPTIONS,
  IntelligenceScheduler,
} from './scheduler.js';
import { WorkspaceIndex } from './workspace-index.js';

/**
 * Drafting with a model: what clients said in meetings, recommendations and
 * patterns across clients, after syncs, and the model service other
 * features call. Each workspace drafts on its own API key for its model's
 * provider; Claude can also run on Dossier's, once ANTHROPIC_API_KEY is set.
 */
@Module({
  imports: [IntegrationsModule],
  controllers: [IntelligenceController, PatternsController],
  providers: [
    IntelligenceService,
    ContextPacks,
    MeetingPointsExtractor,
    RecommendationDrafter,
    WorkspaceDigests,
    PatternFinder,
    IntelligenceScheduler,
    WorkspaceIndex,
    {
      provide: INTELLIGENCE_MODEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const key = config.get('ANTHROPIC_API_KEY', { infer: true });
        return key ? new ClaudeModel(key) : null;
      },
    },
    { provide: MODEL_CLIENTS, useClass: ProviderClients },
    { provide: INTELLIGENCE_OPTIONS, useValue: DEFAULT_INTELLIGENCE_OPTIONS },
  ],
  exports: [
    IntelligenceService,
    ContextPacks,
    IntelligenceScheduler,
    WorkspaceIndex,
  ],
})
export class IntelligenceModule {}
