import { Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { QuestionAnswerer } from './question-answerer.js';
import { ReportQuestionsController } from './questions.controller.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [IntelligenceModule],
  controllers: [ReportsController, ReportQuestionsController],
  providers: [ReportsService, QuestionAnswerer],
})
export class ReportsModule {}
