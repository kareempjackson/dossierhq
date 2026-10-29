import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { IntelligenceController } from './intelligence.controller.js';
import { IntelligenceService } from './intelligence.service.js';
import { MeetingPointsExtractor } from './meeting-points.js';
import { ClaudeModel, INTELLIGENCE_MODEL } from './model.js';
import { ContextPacks } from './pack.js';
import { RecommendationDrafter } from './recommendations.js';
import {
  DEFAULT_INTELLIGENCE_OPTIONS,
  INTELLIGENCE_OPTIONS,
  IntelligenceScheduler,
} from './scheduler.js';

/**
 * Drafting with Claude: what clients said in meetings and recommendations,
 * after syncs, and the model service other features call. Off (the model is
 * null) until ANTHROPIC_API_KEY is set.
 */
@Module({
  imports: [IntegrationsModule],
  controllers: [IntelligenceController],
  providers: [
    IntelligenceService,
    ContextPacks,
    MeetingPointsExtractor,
    RecommendationDrafter,
    IntelligenceScheduler,
    {
      provide: INTELLIGENCE_MODEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const key = config.get('ANTHROPIC_API_KEY', { infer: true });
        return key ? new ClaudeModel(key) : null;
      },
    },
    { provide: INTELLIGENCE_OPTIONS, useValue: DEFAULT_INTELLIGENCE_OPTIONS },
  ],
  exports: [IntelligenceService, ContextPacks, IntelligenceScheduler],
})
export class IntelligenceModule {}
