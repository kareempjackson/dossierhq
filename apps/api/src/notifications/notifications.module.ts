import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { Notifier } from './notifier.js';

/** People's notifications: made from events by the Notifier, read by the controller. */
@Module({
  controllers: [NotificationsController],
  providers: [Notifier],
})
export class NotificationsModule {}
