import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module.js';
import { AskModule } from './ask/ask.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { validateConfig } from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthController } from './health/health.controller.js';
import { InsightsModule } from './insights/insights.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { IntelligenceModule } from './intelligence/intelligence.module.js';
import { MailModule } from './mail/mail.module.js';
import { MembersModule } from './members/members.module.js';
import { NotesModule } from './notes/notes.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
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
    MailModule,
    AuditModule,
    EventsModule,
    AuthModule,
    ClientsModule,
    InsightsModule,
    ReportsModule,
    IntegrationsModule,
    IntelligenceModule,
    MembersModule,
    NotesModule,
    AskModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [HealthController, WorkspaceController],
})
export class AppModule {}
