import { Module } from '@nestjs/common';
import {
  AuditController,
  ConnectorsController,
} from './connections.controller.js';

@Module({ controllers: [ConnectorsController, AuditController] })
export class ConnectionsModule {}
