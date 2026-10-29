import { LOGO_TYPES } from '@dossierhq/contracts';
import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { raw } from 'express';
import {
  RecipientsController,
  ReportSettingsController,
} from './delivery.controller.js';
import { DeliveryService } from './delivery.service.js';

@Module({
  controllers: [ReportSettingsController, RecipientsController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // The logo arrives as the image itself. Read up to 1 MB, so one that's
    // too big gets a 413 saying how big it may be.
    consumer
      .apply(raw({ type: [...LOGO_TYPES], limit: '1mb' }))
      .forRoutes({ path: 'report-settings/logo', method: RequestMethod.PUT });
  }
}
