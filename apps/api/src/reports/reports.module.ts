import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { QuestionAnswerer } from './question-answerer.js';
import { ReportQuestionsController } from './questions.controller.js';
import { ReportDeliveryController } from './report-delivery.controller.js';
import { ReportScheduler } from './report-scheduler.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [IntelligenceModule, DeliveryModule],
  controllers: [
    ReportsController,
    ReportDeliveryController,
    ReportQuestionsController,
  ],
  providers: [ReportsService, QuestionAnswerer, ReportScheduler],
})
export class ReportsModule {}
