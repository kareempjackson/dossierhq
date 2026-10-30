import { Global, Module } from '@nestjs/common';
import { EventBus } from './event-bus.js';
import { EventDispatcher } from './event-dispatcher.js';

/**
 * The event bus: every feature publishes through EventBus, and subscribers
 * (the notifier) get each event from the EventDispatcher.
 */
@Global()
@Module({
  providers: [EventBus, EventDispatcher],
  exports: [EventBus, EventDispatcher],
})
export class EventsModule {}
