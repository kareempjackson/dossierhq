import { Module } from '@nestjs/common';
import {
  AttentionController,
  CommitmentsController,
  RecommendationsController,
} from './insights.controller.js';
import { RecommendationsService } from './recommendations.service.js';

@Module({
  controllers: [
    AttentionController,
    RecommendationsController,
    CommitmentsController,
  ],
  providers: [RecommendationsService],
})
export class InsightsModule {}
