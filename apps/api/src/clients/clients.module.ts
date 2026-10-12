import { Module } from '@nestjs/common';
import {
  ClientsController,
  DevicesController,
  MeetingsController,
  SourcesController,
} from './clients.controller.js';

@Module({
  controllers: [
    ClientsController,
    SourcesController,
    MeetingsController,
    DevicesController,
  ],
})
export class ClientsModule {}
