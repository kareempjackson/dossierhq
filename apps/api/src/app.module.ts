import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { validateConfig } from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { InsightsModule } from './insights/insights.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
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
    AuthModule,
    ClientsModule,
    InsightsModule,
    ReportsModule,
    IntegrationsModule,
  ],
  controllers: [HealthController, WorkspaceController],
})
export class AppModule {}
