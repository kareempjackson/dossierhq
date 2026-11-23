import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProgressModule } from './progress/progress.module.js';
import { ShellModule } from './shell/shell.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AskModule } from './ask/ask.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { ActivityModule } from './common/activity.js';
import { LeasesModule } from './common/leases.js';
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
import { ProductUpdatesModule } from './product-updates/product-updates.module.js';
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
    ActivityModule,
    LeasesModule,
    AuthModule,
    ClientsModule,
    InsightsModule,
    ReportsModule,
    IntegrationsModule,
    IntelligenceModule,
    MembersModule,
    NotesModule,
    ProductUpdatesModule,
    AskModule,
    NotificationsModule,
    AdminModule,
    ProgressModule,
    ShellModule,
  ],
  controllers: [HealthController, WorkspaceController],
})
export class AppModule {}
