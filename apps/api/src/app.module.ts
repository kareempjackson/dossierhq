import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ClientsModule } from './clients/clients.module.js';
import { WorkspaceGuard } from './common/workspace.js';
import { validateConfig } from './config/configuration.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { InsightsModule } from './insights/insights.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { WorkspaceController } from './workspace/workspace.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateConfig,
    }),
    DatabaseModule,
    ClientsModule,
    InsightsModule,
    ReportsModule,
    ConnectionsModule,
  ],
  controllers: [HealthController, WorkspaceController],
  providers: [{ provide: APP_GUARD, useClass: WorkspaceGuard }],
})
export class AppModule {}
