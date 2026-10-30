import {
  notificationChannels,
  readNotificationPreferences,
  type DomainEvent,
  type Member,
} from '@dossierhq/contracts';
import type { DatabaseAdapter, NotificationRecord } from '@dossierhq/database';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Clock } from '../common/clock.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { EventBus, type RecordedEvent } from '../events/event-bus.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { hearsAbout } from './audience.js';
import { describe } from './describe.js';
import { renderNotificationEmail } from './email.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** An email claimed this long ago and never sent was abandoned. */
const EMAIL_CLAIM_MS = 10 * 60_000;

const clientOf = (event: DomainEvent) =>
  'clientId' in event ? event.clientId : null;

/**
 * Turns events into notifications: one for each person who hears about it
 * and wants it, in their feed and by email as they chose. Safe to run twice
 * for one event: notifications are kept once per person, and each email is
 * claimed before it's sent, so a retry after a failed send emails only
 * those who didn't get it.
 */
@Injectable()
export class Notifier implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(Notifier.name);
  private readonly webUrl: string;
  private readonly days: number;
  /** When each workspace's old notifications were last pruned. */
  private readonly pruned = new Map<string, number>();
  private unsubscribe?: () => void;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    config: ConfigService<AppConfig, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
    this.days = config.get('NOTIFICATION_DAYS', { infer: true });
  }

  onModuleInit() {
    this.unsubscribe = this.bus.subscribe('notifier', (recorded) =>
      this.notify(recorded),
    );
  }

  onApplicationShutdown() {
    this.unsubscribe?.();
  }

  async notify({ id, workspaceId, actorUserId, event }: RecordedEvent) {
    const [workspace, members, saved] = await Promise.all([
      this.db.workspaces.get(workspaceId),
      this.db.users.members(workspaceId),
      this.db.notifications.preferences(workspaceId),
    ]);
    if (!workspace) return;
    const [clientName, actorName] = await Promise.all([
      this.clientName(workspaceId, clientOf(event)),
      actorUserId === null
        ? null
        : (members.find((m) => m.id === actorUserId)?.name ?? null),
    ]);

    const now = this.clock.now();
    const notifications = members
      .filter((member) => hearsAbout(member, event, actorUserId))
      .flatMap((member): NotificationRecord[] => {
        const channels = notificationChannels(
          event.type,
          readNotificationPreferences(saved[member.id]),
        );
        if (!channels.inApp && !channels.email) return [];
        const described = describe(event, {
          clientName,
          actorName,
          recipientId: member.id,
          timeZone: workspace.timeZone,
        });
        return [
          {
            id: `ntf-${randomUUID()}`,
            eventId: id,
            userId: member.id,
            type: event.type,
            ...described,
            createdAt: now,
            readAt: null,
            inApp: channels.inApp,
            email: channels.email,
            emailSentAt: null,
          },
        ];
      });
    await this.db.notifications.add(workspaceId, notifications);

    // What's stored decides, not what was just made: on a retry, the
    // notifications are the first try's, and some emails may have gone.
    const stored = await this.db.notifications.forEvent(workspaceId, id);
    let failure: unknown = null;
    for (const notification of stored) {
      const member = members.find((m) => m.id === notification.userId);
      if (!notification.email || notification.emailSentAt || !member) continue;
      try {
        await this.email(workspaceId, workspace.name, notification, member);
      } catch (error) {
        failure ??= error;
      }
    }
    await this.prune(workspaceId, now);
    if (failure) throw failure;
  }

  private async email(
    workspaceId: string,
    workspaceName: string,
    notification: NotificationRecord,
    member: Member,
  ) {
    const now = this.clock.now();
    const staleBefore = new Date(
      Date.parse(now) - EMAIL_CLAIM_MS,
    ).toISOString();
    const claimed = await this.db.notifications.claimEmail(
      workspaceId,
      notification.id,
      now,
      staleBefore,
    );
    if (!claimed) return;
    try {
      await this.mailer.send({
        to: [member.email],
        ...renderNotificationEmail(notification, {
          workspaceName,
          webUrl: this.webUrl,
        }),
        tag: 'notification',
      });
    } catch (error) {
      await this.db.notifications
        .releaseEmail(workspaceId, notification.id)
        .catch(this.warn);
      throw error;
    }
    await this.db.notifications.markEmailed(
      workspaceId,
      notification.id,
      this.clock.now(),
    );
  }

  private async clientName(workspaceId: string, clientId: string | null) {
    if (clientId === null) return null;
    return (await this.db.clients.get(workspaceId, clientId))?.name ?? null;
  }

  /** Drops a workspace's notifications past NOTIFICATION_DAYS, at most hourly. */
  private async prune(workspaceId: string, now: string) {
    const at = Date.parse(now);
    const last = this.pruned.get(workspaceId);
    if (last !== undefined && at - last < HOUR_MS) return;
    this.pruned.set(workspaceId, at);
    await this.db.notifications
      .prune(workspaceId, new Date(at - this.days * DAY_MS).toISOString())
      .catch(this.warn);
  }

  private readonly warn = (error: unknown) =>
    this.logger.warn(
      `Couldn’t update notifications: ${error instanceof Error ? error.message : String(error)}`,
    );
}
