import type { Tool } from '@dossierhq/contracts';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import type { ToolConnector } from './connector.js';
import {
  ConnectorsController,
  MeetingAttachmentsController,
} from './connectors.controller.js';
import type { HttpOptions } from './http.js';
import { SyncScheduler } from './scheduler.js';
import { Secrets } from './secrets.js';
import { CONNECTORS, HTTP_OPTIONS, SyncService } from './sync.service.js';
import { fathomConnector } from './tools/fathom.js';
import { huduConnector } from './tools/hudu.js';
import { ninjaOneConnector } from './tools/ninjaone.js';
import { sharePointConnector } from './tools/sharepoint.js';

/** The four tools Dossier reads from, their credentials and their syncs. */
@Module({
  controllers: [ConnectorsController, MeetingAttachmentsController],
  providers: [
    SyncService,
    SyncScheduler,
    {
      provide: Secrets,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new Secrets(config.get('CONNECTOR_SECRET_KEY', { infer: true })),
    },
    {
      provide: CONNECTORS,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<AppConfig, true>,
      ): ReadonlyMap<Tool, ToolConnector> => {
        const url = (key: keyof AppConfig) =>
          config.get(key, { infer: true }) as string | undefined;
        return new Map<Tool, ToolConnector>([
          [
            'ninjaone',
            ninjaOneConnector({
              apiUrl: url('NINJAONE_API_URL'),
            }) as ToolConnector,
          ],
          ['hudu', huduConnector() as ToolConnector],
          [
            'sharepoint',
            sharePointConnector({
              loginUrl: url('MICROSOFT_LOGIN_URL'),
              graphUrl: url('MICROSOFT_GRAPH_URL'),
            }) as ToolConnector,
          ],
          [
            'fathom',
            fathomConnector({ apiUrl: url('FATHOM_API_URL') }) as ToolConnector,
          ],
        ]);
      },
    },
    { provide: HTTP_OPTIONS, useValue: {} satisfies HttpOptions },
  ],
  exports: [SyncService, Secrets],
})
export class IntegrationsModule {}
