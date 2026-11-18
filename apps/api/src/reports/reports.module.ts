import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { BriefWriter } from './brief-writer.js';
import { QuestionAnswerer } from './question-answerer.js';
import { ReportQuestionsController } from './questions.controller.js';
import { ReportDeliveryController } from './report-delivery.controller.js';
import { ReportScheduler } from './report-scheduler.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [IntelligenceModule, IntegrationsModule, DeliveryModule],
  controllers: [
    ReportsController,
    ReportDeliveryController,
    ReportQuestionsController,
  ],
  providers: [ReportsService, QuestionAnswerer, BriefWriter, ReportScheduler],
})
export class ReportsModule {}
