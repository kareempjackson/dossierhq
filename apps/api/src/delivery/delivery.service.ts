import {
  DEFAULT_BRAND_COLOUR,
  type LogoType,
  type OutboxItem,
  type Recipient,
  type RecipientsUpdate,
  type Report,
  type ReportDelivery,
  type ReportDeliveryStatus,
  type ReportEmail,
  type ReportSettings,
  type ReportSettingsUpdate,
  type ReportSummary,
  type Source,
} from '@dossierhq/contracts';
import type {
  DatabaseAdapter,
  StoredReportSettings,
} from '@dossierhq/database';
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AuditLog, type Actor } from '../audit/audit-log.js';
import { Clock } from '../common/clock.js';
import type { AppConfig } from '../config/configuration.js';
import { notFound } from '../common/not-found.js';
import { DATABASE } from '../database/database.module.js';
import { fromWithName, MAILER, type Mailer } from '../mail/mailer.js';
import { weekOf as weekLabel } from '../reports/week-label.js';
import { renderReportEmail } from './report-email.js';
import { sendsAt } from './schedule.js';

const DEFAULTS: StoredReportSettings = {
  senderName: '',
  replyTo: null,
  brandColour: DEFAULT_BRAND_COLOUR,
  logo: null,
  draftAt: null,
  sendAt: null,
  sendFrom: null,
};

/** How many sources one read asks for, to keep requests short. */
const SOURCE_BATCH = 50;
/** How far back the outbox looks for approved reports still to send. */
const OUTBOX_DAYS = 14;
const DAY_MS = 86_400_000;

/** The content ID the logo goes by inside a sent email. */
const LOGO_CID = 'logo';

/**
 * Weekly reports on their way out: each workspace's branding and schedule,
 * who each client's report goes to, and sending. Only an approved report
 * goes; sending marks it sent first, so it goes once and can't change after.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly mailFrom: string;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
    config: ConfigService<AppConfig, true>,
  ) {
    this.mailFrom = config.get('mail', { infer: true }).from;
  }

  async settings(workspaceId: string): Promise<ReportSettings> {
    return shown(await this.stored(workspaceId));
  }

  /**
   * Saves everything but the logo. Turning sending on starts from now:
   * reports approved before it don't suddenly go out.
   */
  async saveSettings(
    workspaceId: string,
    update: Required<ReportSettingsUpdate> & { replyTo: string | null },
  ): Promise<ReportSettings> {
    const current = await this.stored(workspaceId);
    const next: StoredReportSettings = {
      ...current,
      senderName: update.senderName,
      replyTo: update.replyTo,
      brandColour: update.brandColour,
      draftAt: update.draftAt,
      sendAt: update.sendAt,
      sendFrom: update.sendAt ? (current.sendFrom ?? this.clock.now()) : null,
    };
    await this.db.reportSettings.save(workspaceId, next);
    return shown(next);
  }

  async setLogo(
    workspaceId: string,
    logo: { type: LogoType; bytes: Buffer } | null,
  ): Promise<ReportSettings> {
    const next: StoredReportSettings = {
      ...(await this.stored(workspaceId)),
      logo: logo && { type: logo.type, base64: logo.bytes.toString('base64') },
    };
    await this.db.reportSettings.save(workspaceId, next);
    return shown(next);
  }

  async recipients(
    workspaceId: string,
    clientId: string,
  ): Promise<Recipient[]> {
    await this.client(workspaceId, clientId);
    return this.db.recipients.list(workspaceId, clientId);
  }

  async saveRecipients(
    workspaceId: string,
    clientId: string,
    recipients: Required<RecipientsUpdate>['recipients'],
  ): Promise<Recipient[]> {
    await this.client(workspaceId, clientId);
    const saved = recipients.map((r) => ({
      name: r.name,
      email: r.email,
      copy: r.copy ?? false,
    }));
    await this.db.recipients.replace(workspaceId, clientId, saved);
    return saved;
  }

  /** Who a report goes to, when, and every try so far. */
  async status(
    workspaceId: string,
    reportId: string,
  ): Promise<ReportDeliveryStatus> {
    const report = await this.summary(workspaceId, reportId);
    const [settings, workspace, recipients, deliveries] = await Promise.all([
      this.stored(workspaceId),
      this.workspace(workspaceId),
      this.db.recipients.list(workspaceId, report.clientId),
      this.db.deliveries.list(workspaceId, reportId),
    ]);
    return {
      ...addresses(recipients),
      sendAt: settings.sendAt,
      sendsAt: due(
        report,
        settings,
        workspace.timeZone,
        recipients,
        deliveries,
      ),
      deliveries,
    };
  }

  /** Approved reports from the last two weeks still to go, newest first. */
  async outbox(workspaceId: string): Promise<OutboxItem[]> {
    const since = Date.parse(this.clock.now()) - OUTBOX_DAYS * DAY_MS;
    const waiting = (
      await this.db.reports.listSummaries(workspaceId, { status: 'approved' })
    ).filter(
      (report) =>
        report.sentAt === null &&
        report.approvedAt !== null &&
        Date.parse(report.approvedAt) >= since,
    );
    if (waiting.length === 0) return [];
    const [settings, workspace] = await Promise.all([
      this.stored(workspaceId),
      this.workspace(workspaceId),
    ]);
    const recipientsOf = new Map<string, Recipient[]>();
    for (const clientId of new Set(waiting.map((r) => r.clientId))) {
      recipientsOf.set(
        clientId,
        await this.db.recipients.list(workspaceId, clientId),
      );
    }
    return Promise.all(
      waiting.map(async (report) => {
        const recipients = recipientsOf.get(report.clientId) ?? [];
        const deliveries = await this.db.deliveries.list(
          workspaceId,
          report.id,
        );
        return {
          reportId: report.id,
          clientId: report.clientId,
          weekStart: report.weekStart,
          approvedAt: report.approvedAt!,
          sendsAt: due(
            report,
            settings,
            workspace.timeZone,
            recipients,
            deliveries,
          ),
          recipients: recipients.length,
          failed: deliveries[0]?.outcome === 'failed' ? deliveries[0] : null,
        };
      }),
    );
  }

  /**
   * The email a report goes out as, its logo inline, to look at first. A
   * draft shows as it would once approved, without lines that have no source.
   */
  async preview(workspaceId: string, reportId: string): Promise<ReportEmail> {
    const report =
      (await this.db.reports.get(workspaceId, reportId)) ??
      notFound('Report', reportId);
    const outgoing: Report = {
      ...report,
      sections: report.sections.map((section) => ({
        ...section,
        lines: section.lines.filter(
          (line) => line.sourceIds.length > 0 && !line.pending,
        ),
      })),
    };
    const { settings, rendered, recipients } = await this.render(
      workspaceId,
      outgoing,
      'inline',
    );
    return {
      from: fromWithName(this.mailFrom, settings.senderName),
      ...addresses(recipients),
      replyTo: settings.replyTo,
      ...rendered,
    };
  }

  /**
   * Sends an approved report to its client's recipients, once. A person
   * sends it as `by`; the schedule as null. A refusal is a 409; a send the
   * mail provider turns down is a failed delivery, logged with why.
   */
  async send(
    workspaceId: string,
    reportId: string,
    by: Actor | null,
  ): Promise<ReportDelivery> {
    const report =
      (await this.db.reports.get(workspaceId, reportId)) ??
      notFound('Report', reportId);
    if (report.sentAt) {
      throw new ConflictException(
        'This report has already gone to the client.',
      );
    }
    if (report.status !== 'approved') {
      throw new ConflictException('Approve the report before it goes out.');
    }
    const { settings, rendered, recipients, logo, client } = await this.render(
      workspaceId,
      report,
      'attached',
    );
    const { to, cc } = addresses(recipients);
    if (to.length === 0) {
      throw new ConflictException(
        `${client.name} has no one to send reports to yet. Add them on ${client.name}’s Reports tab.`,
      );
    }

    const at = this.clock.now();
    if (!(await this.db.reports.markSent(workspaceId, reportId, at))) {
      throw new ConflictException(
        'This report has already gone to the client.',
      );
    }
    const sender = by === null ? null : await this.person(by);
    const delivery = {
      id: `dlv-${randomUUID()}`,
      reportId,
      clientId: report.clientId,
      at,
      to,
      cc,
      sentBy: sender,
    };
    const week = weekLabel(report.weekStart);
    try {
      const { id } = await this.mailer.send({
        to,
        cc,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        fromName: settings.senderName || client.workspaceName,
        replyTo: settings.replyTo ?? undefined,
        attachments: logo ? [logo] : undefined,
        tag: 'weekly-report',
      });
      const sent: ReportDelivery = {
        ...delivery,
        outcome: 'sent',
        problem: null,
      };
      await this.db.deliveries.add(workspaceId, { ...sent, messageId: id });
      await this.audit.record(workspaceId, by, {
        kind: 'change',
        clientId: report.clientId,
        what: `Sent the weekly report for ${week} to ${[...to, ...cc].join(', ')}${by === null ? ', on schedule' : ''}`,
      });
      return sent;
    } catch (error) {
      await this.db.reports.clearSent(workspaceId, reportId);
      const problem =
        error instanceof Error && error.name === 'MailError'
          ? error.message
          : 'Dossier couldn’t send the email.';
      if (!(error instanceof Error && error.name === 'MailError')) {
        this.logger.error(
          `Sending ${reportId} failed`,
          (error as Error)?.stack,
        );
      }
      const failed: ReportDelivery = {
        ...delivery,
        outcome: 'failed',
        problem,
      };
      await this.db.deliveries.add(workspaceId, { ...failed, messageId: null });
      await this.audit.record(workspaceId, by, {
        kind: 'change',
        clientId: report.clientId,
        what: `Couldn’t send the weekly report for ${week}: ${problem}`,
        outcome: 'failed',
      });
      return failed;
    }
  }

  private async render(
    workspaceId: string,
    report: Report,
    logoAs: 'attached' | 'inline',
  ) {
    const [settings, workspace, clientRow, recipients, sources] =
      await Promise.all([
        this.stored(workspaceId),
        this.workspace(workspaceId),
        this.client(workspaceId, report.clientId),
        this.db.recipients.list(workspaceId, report.clientId),
        this.sources(workspaceId, report),
      ]);
    const logo = settings.logo && {
      name: settings.logo.type === 'image/png' ? 'logo.png' : 'logo.jpg',
      contentType: settings.logo.type,
      content: settings.logo.base64,
      contentId: LOGO_CID,
    };
    const rendered = renderReportEmail({
      report,
      workspaceName: workspace.name,
      timeZone: workspace.timeZone,
      settings,
      sources,
      logoSrc: !logo
        ? null
        : logoAs === 'attached'
          ? `cid:${LOGO_CID}`
          : `data:${logo.contentType};base64,${logo.content}`,
    });
    return {
      settings: {
        ...settings,
        senderName: settings.senderName || workspace.name,
      },
      rendered,
      recipients,
      logo,
      client: { ...clientRow, workspaceName: workspace.name },
    };
  }

  /** What the report cites: its own snapshots, else the records as they are. */
  private async sources(
    workspaceId: string,
    report: Report,
  ): Promise<Source[]> {
    const own = new Map(report.sources.map((source) => [source.id, source]));
    const cited = [
      ...new Set(
        report.sections.flatMap((s) => s.lines.flatMap((l) => l.sourceIds)),
      ),
    ];
    const missing = cited.filter((id) => !own.has(id));
    for (let i = 0; i < missing.length; i += SOURCE_BATCH) {
      for (const source of await this.db.sources.getMany(
        workspaceId,
        missing.slice(i, i + SOURCE_BATCH),
      )) {
        own.set(source.id, source);
      }
    }
    return cited.flatMap((id) => own.get(id) ?? []);
  }

  private async stored(workspaceId: string): Promise<StoredReportSettings> {
    return (await this.db.reportSettings.get(workspaceId)) ?? DEFAULTS;
  }

  private async workspace(workspaceId: string) {
    return (await this.db.workspaces.get(workspaceId)) ?? notFound('Workspace');
  }

  private async client(workspaceId: string, clientId: string) {
    return (
      (await this.db.clients.get(workspaceId, clientId)) ??
      notFound('Client', clientId)
    );
  }

  private async summary(
    workspaceId: string,
    reportId: string,
  ): Promise<ReportSummary> {
    const report = await this.db.reports.get(workspaceId, reportId);
    return report ?? notFound('Report', reportId);
  }

  private async person(by: Actor) {
    if (typeof by !== 'string') return { userId: by.id, name: by.name };
    const user = await this.db.users.get(by);
    return { userId: by, name: user?.name ?? by };
  }
}

/** The settings as the API shows them, the logo as a data URL. */
const shown = (settings: StoredReportSettings): ReportSettings => ({
  senderName: settings.senderName,
  replyTo: settings.replyTo,
  brandColour: settings.brandColour,
  logo: settings.logo
    ? `data:${settings.logo.type};base64,${settings.logo.base64}`
    : null,
  draftAt: settings.draftAt,
  sendAt: settings.sendAt,
});

const addresses = (recipients: Recipient[]) => ({
  to: recipients.filter((r) => !r.copy).map((r) => r.email),
  cc: recipients.filter((r) => r.copy).map((r) => r.email),
});

/**
 * When an approved report goes on schedule; null when it won't by itself:
 * sent, no schedule, approved before sending was on, no one to send to, or
 * tried before (a person sends it again, so failures don't repeat).
 */
export function due(
  report: Pick<ReportSummary, 'status' | 'approvedAt' | 'sentAt'>,
  settings: StoredReportSettings,
  timeZone: string,
  recipients: Recipient[],
  deliveries: ReportDelivery[],
): string | null {
  if (
    report.status !== 'approved' ||
    report.sentAt !== null ||
    report.approvedAt === null ||
    settings.sendAt === null ||
    settings.sendFrom === null ||
    Date.parse(report.approvedAt) < Date.parse(settings.sendFrom) ||
    !recipients.some((r) => !r.copy) ||
    deliveries.length > 0
  ) {
    return null;
  }
  return sendsAt(report.approvedAt, settings.sendAt, timeZone);
}
