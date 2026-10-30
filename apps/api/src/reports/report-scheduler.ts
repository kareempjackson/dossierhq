import type { DatabaseAdapter } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLog } from '../audit/audit-log.js';
import { Clock } from '../common/clock.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { due, DeliveryService } from '../delivery/delivery.service.js';
import { inWeekOf, reached, sendsAt } from '../delivery/schedule.js';
import { EventBus } from '../events/event-bus.js';
import { weekOf } from './drafter.js';
import { draftedEvent } from './report-events.js';
import { ReportsService } from './reports.service.js';
import { weekOf as weekLabel } from './week-label.js';

/**
 * Drafts and sends weekly reports on each workspace's schedule, looking
 * every REPORT_SCHEDULE_MINUTES. Drafting runs once a week, at the chosen
 * time or the first look after; an approved report goes at the week's
 * sending time, or at the next look if that has passed. A send that fails
 * isn't tried again by itself: someone sends it from the report.
 * In-process, like the sync scheduler: run one API instance per database,
 * though a second only finds the week already drafted and reports sent.
 */
@Injectable()
export class ReportScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReportScheduler.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly reports: ReportsService,
    private readonly delivery: DeliveryService,
    private readonly audit: AuditLog,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onApplicationBootstrap() {
    const minutes = this.config.get('REPORT_SCHEDULE_MINUTES', {
      infer: true,
    });
    if (!minutes) return;
    this.timers.push(
      setTimeout(() => void this.tick(), 20_000).unref(),
      setInterval(() => void this.tick(), minutes * 60_000).unref(),
    );
    this.logger.log(
      `Looking for reports to draft or send every ${minutes} minutes`,
    );
  }

  onApplicationShutdown() {
    for (const timer of this.timers) clearTimeout(timer);
  }

  /** One look at every scheduled workspace, as of `now`. */
  tick(now = this.clock.now()): Promise<void> {
    // A slow look (many reports, slow mail) never overlaps the next.
    this.running ??= this.lookAll(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async lookAll(now: string) {
    let workspaces: string[];
    try {
      workspaces = await this.db.reportSettings.listScheduled();
    } catch (error) {
      this.logger.warn(
        `Couldn’t list report schedules: ${(error as Error).message}`,
      );
      return;
    }
    for (const workspaceId of workspaces) {
      await this.look(workspaceId, now).catch((error: unknown) =>
        this.logger.error(
          `Scheduled reports for ${workspaceId} failed`,
          (error as Error)?.stack,
        ),
      );
    }
  }

  private async look(workspaceId: string, now: string) {
    const [settings, workspace] = await Promise.all([
      this.db.reportSettings.get(workspaceId),
      this.db.workspaces.get(workspaceId),
    ]);
    if (!settings || !workspace) return;
    const { timeZone } = workspace;

    if (
      settings.draftAt &&
      reached(inWeekOf(now, settings.draftAt, timeZone), now) &&
      (await this.db.reportSettings.markDrafted(
        workspaceId,
        weekOf(now, timeZone).start,
      ))
    ) {
      const drafted = await this.reports.draft(workspaceId);
      await this.audit.record(
        workspaceId,
        null,
        ...drafted.map((report) => ({
          kind: 'change' as const,
          clientId: report.clientId,
          what: `Drafted the weekly report for ${weekLabel(report.weekStart)}, on schedule`,
        })),
      );
      const event = draftedEvent(drafted, true);
      if (event) await this.events.publish(workspaceId, null, event);
    }

    if (settings.sendAt) {
      const approved = await this.db.reports.listSummaries(workspaceId, {
        status: 'approved',
      });
      for (const report of approved) {
        // Cheap checks first: most approved reports went long ago.
        if (report.sentAt || !report.approvedAt || !settings.sendFrom) continue;
        if (Date.parse(report.approvedAt) < Date.parse(settings.sendFrom)) {
          continue;
        }
        const [recipients, deliveries] = await Promise.all([
          this.db.recipients.list(workspaceId, report.clientId),
          this.db.deliveries.list(workspaceId, report.id),
        ]);
        const when = due(report, settings, timeZone, recipients, deliveries);
        if (
          !when &&
          deliveries.length === 0 &&
          !recipients.some((recipient) => !recipient.copy) &&
          reached(sendsAt(report.approvedAt, settings.sendAt, timeZone), now)
        ) {
          // Its time came with nobody to send to: say so once.
          await this.events.publish(
            workspaceId,
            null,
            {
              type: 'report.no-recipients',
              reportId: report.id,
              clientId: report.clientId,
              weekStart: report.weekStart,
            },
            { dedupeKey: `no-recipients:${report.id}` },
          );
        } else if (when && reached(when, now)) {
          // A failure is logged as a delivery; a refusal (someone sent it a
          // moment ago) only skips this one.
          await this.delivery
            .send(workspaceId, report.id, null)
            .catch((error: unknown) =>
              this.logger.warn(
                `Didn’t send ${report.id}: ${(error as Error).message}`,
              ),
            );
        }
      }
    }
  }
}
