import {
  EVENT_TYPES,
  markNotificationsReadSchema,
  notificationChannels,
  notificationPreferencesUpdateSchema,
  notificationsQuerySchema,
  NOTIFICATIONS,
  readNotificationPreferences,
  type EventType,
  type List,
  type MarkNotificationsRead,
  type Notification,
  type NotificationCount,
  type NotificationPage,
  type NotificationPreferencesUpdate,
  type NotificationSetting,
} from '@dossierhq/contracts';
import type {
  DatabaseAdapter,
  NotificationPosition,
  NotificationRecord,
} from '@dossierhq/database';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { roleIn } from '../auth/roles.js';
import { Clock } from '../common/clock.js';
import { notFound } from '../common/not-found.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DATABASE } from '../database/database.module.js';
import { canHearAbout } from './audience.js';

const positionSchema = z.tuple([z.iso.datetime(), z.string().min(1)]);

/** A cursor names the notification a page turns from. */
const cursorAt = (n: NotificationRecord) =>
  Buffer.from(JSON.stringify([n.createdAt, n.id])).toString('base64url');

function positionOf(cursor: string): NotificationPosition {
  try {
    const [at, id] = positionSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString()),
    );
    return { at, id };
  } catch {
    throw new BadRequestException(
      'That page of notifications isn’t valid. Start from the newest.',
    );
  }
}

type KnownRecord = NotificationRecord & { type: EventType };

/** Notifications of types this version of Dossier still has. */
const known = (n: NotificationRecord): n is KnownRecord =>
  n.type in NOTIFICATIONS;

function toNotification(n: KnownRecord): Notification {
  return {
    id: n.id,
    type: n.type,
    category: NOTIFICATIONS[n.type].category,
    title: n.title,
    body: n.body,
    link: n.link,
    at: n.createdAt,
    readAt: n.readAt,
  };
}

/**
 * Your own notifications in this workspace, and what you want to hear
 * about. Everyone has them; nobody sees anyone else's.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly clock: Clock,
  ) {}

  /** Your feed, newest first, a page at a time; `unread` for unread only. */
  @Get()
  async list(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Query(new ZodValidationPipe(notificationsQuerySchema))
    { before, unread, limit }: z.infer<typeof notificationsQuerySchema>,
  ): Promise<NotificationPage> {
    // One more than the page, to learn if there are more.
    const rows = await this.db.notifications.list(workspaceId, userId, {
      before: before === undefined ? undefined : positionOf(before),
      unread,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      data: page.filter(known).map(toNotification),
      older: rows.length > limit ? cursorAt(page.at(-1)!) : null,
    };
  }

  @Get('count')
  async count(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<NotificationCount> {
    return {
      unread: await this.db.notifications.countUnread(workspaceId, userId),
    };
  }

  /** Marks some of yours read by ID, or all of them. */
  @Post('read')
  @HttpCode(HttpStatus.OK)
  async read(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(markNotificationsReadSchema))
    request: MarkNotificationsRead,
  ): Promise<{ marked: number }> {
    const marked = await this.db.notifications.markRead(
      workspaceId,
      userId,
      'all' in request ? 'all' : request.ids,
      this.clock.now(),
    );
    return { marked };
  }

  /** What you hear about and how, for each event your role can hear about. */
  @Get('preferences')
  async preferences(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
  ): Promise<List<NotificationSetting>> {
    return { data: await this.settings(workspaceId, userId) };
  }

  /** Changes some event types' channels; locked ones stay on. */
  @Put('preferences')
  async setPreferences(
    @WorkspaceId() workspaceId: string,
    @UserId() userId: string,
    @Body(new ZodValidationPipe(notificationPreferencesUpdateSchema))
    update: NotificationPreferencesUpdate,
  ): Promise<List<NotificationSetting>> {
    const saved = await this.db.notifications.preferences(workspaceId);
    const stored = readNotificationPreferences(saved[userId]);
    for (const [type, channels] of Object.entries(update) as [
      EventType,
      { inApp?: boolean; email?: boolean },
    ][]) {
      stored[type] = { ...stored[type], ...channels };
    }
    if (
      !(await this.db.notifications.setPreferences(workspaceId, userId, stored))
    ) {
      notFound('Member', userId);
    }
    return { data: await this.settings(workspaceId, userId) };
  }

  private async settings(
    workspaceId: string,
    userId: string,
  ): Promise<NotificationSetting[]> {
    const [role, saved] = await Promise.all([
      roleIn(this.db, userId, workspaceId),
      this.db.notifications.preferences(workspaceId),
    ]);
    if (role === null) notFound('Member', userId);
    const stored = readNotificationPreferences(saved[userId]);
    return EVENT_TYPES.filter((type) => canHearAbout(type, role)).map(
      (type) => {
        const { category, label, description, locked } = NOTIFICATIONS[type];
        return {
          type,
          category,
          label,
          description,
          ...notificationChannels(type, stored),
          locked,
        };
      },
    );
  }
}
