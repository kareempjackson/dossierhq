import { CONTRACT_DOCUMENT_TYPES } from '@dossierhq/contracts';
import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { raw } from 'express';
import {
  ClientsController,
  DevicesController,
  MeetingsController,
  SourcesController,
  TicketsController,
} from './clients.controller.js';
import { ContractsController } from './contracts.controller.js';

@Module({
  controllers: [
    ClientsController,
    ContractsController,
    SourcesController,
    MeetingsController,
    DevicesController,
    TicketsController,
  ],
})
export class ClientsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // A contract document arrives as the file itself. Read a little past
    // 10 MB, so one that's too big gets a 413 saying how big it may be.
    consumer
      .apply(raw({ type: Object.keys(CONTRACT_DOCUMENT_TYPES), limit: '11mb' }))
      .forRoutes({
        path: 'clients/:id/contract/documents',
        method: RequestMethod.POST,
      });
  }
}
