import { Module } from '@nestjs/common';
import {
  ClientsController,
  DevicesController,
  MeetingsController,
  SourcesController,
  TicketsController,
} from './clients.controller.js';

@Module({
  controllers: [
    ClientsController,
    SourcesController,
    MeetingsController,
    DevicesController,
    TicketsController,
  ],
})
export class ClientsModule {}
