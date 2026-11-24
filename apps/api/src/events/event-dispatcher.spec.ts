import type { DomainEvent } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import type { ConfigService } from '@nestjs/config';
import type { Clock } from '../common/clock.js';
import type { AppConfig } from '../config/configuration.js';
import { EventBus, type EventHandler } from './event-bus.js';
import {
  EventDispatcher,
  IDLE_POLL_MS,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
} from './event-dispatcher.js';

const ws = demo.workspace.id;
const T0 = '2026-10-09T15:40:00.000Z';
const at = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

const failing: DomainEvent = {
  type: 'connection.failing',
  tool: 'hudu',
  problem: 'Hudu turned down the API key.',
  needsSettings: true,
};

function setup(seconds = 0, clock = { now: () => T0 } as Clock) {
  const db: DatabaseAdapter = createMemoryAdapter(demo);
  const config = {
    get: () => seconds,
  } as unknown as ConfigService<AppConfig, true>;
  const bus = new EventBus(db, clock);
  const dispatcher = new EventDispatcher(db, bus, clock, config);
  return { db, bus, dispatcher };
}

describe('EventBus and EventDispatcher', () => {
  it('hands each event to every subscriber, once', async () => {
    const { bus, dispatcher } = setup();
    const first = vi.fn<EventHandler>(async () => {});
    const second = vi.fn<EventHandler>(async () => {});
    bus.subscribe('first', first);
    bus.subscribe('second', second);
    expect(() => bus.subscribe('first', first)).toThrow(/already exists/);

    await bus.publish(ws, 'usr-sam', failing);
    await dispatcher.tick(T0);
    await dispatcher.tick(at(60 * 60_000));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first.mock.calls[0]![0]).toMatchObject({
      workspaceId: ws,
      actorUserId: 'usr-sam',
      occurredAt: T0,
      attempts: 1,
      event: failing,
    });
  });

  it('looks less often while there is nothing to hand on', async () => {
    vi.useFakeTimers();
    const { db, bus, dispatcher } = setup(15);
    try {
      const claim = vi.spyOn(db.events, 'claim');
      const handler = vi.fn<EventHandler>(async () => {});
      bus.subscribe('first', handler);
      dispatcher.onApplicationBootstrap();
      // Every 15 seconds would be 240 looks an hour.
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      expect(claim.mock.calls.length).toBeGreaterThan(10);
      expect(claim.mock.calls.length).toBeLessThan(20);

      // An event is still handed on at once,
      await bus.publish(ws, null, failing);
      await vi.advanceTimersByTimeAsync(300);
      expect(handler).toHaveBeenCalledTimes(1);
      // and the timer is brisk again once it has seen one.
      // Idle, that's one look in five minutes.
      claim.mockClear();
      await vi.advanceTimersByTimeAsync(IDLE_POLL_MS);
      expect(claim.mock.calls.length).toBeGreaterThan(1);
    } finally {
      dispatcher.onApplicationShutdown();
      vi.useRealTimers();
    }
  });

  it('looks again when a retry falls due, whatever the timer is at', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    const clock = { now: () => new Date().toISOString() } as Clock;
    const { bus, dispatcher } = setup(15, clock);
    try {
      let down = true;
      const handler = vi.fn<EventHandler>(async () => {
        if (down) throw new Error('Mail is down');
      });
      bus.subscribe('mail', handler);
      dispatcher.onApplicationBootstrap();
      // Idle for an hour: the timer is at its slowest.
      await vi.advanceTimersByTimeAsync(60 * 60_000);
      await bus.publish(ws, null, failing);
      await vi.advanceTimersByTimeAsync(300);
      expect(handler).toHaveBeenCalledTimes(1);
      down = false;
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]! + 2_000);
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      dispatcher.onApplicationShutdown();
      vi.useRealTimers();
    }
  });

  it('tries again after each failure, waiting longer, then gives up', async () => {
    const { bus, dispatcher } = setup();
    const handler = vi.fn(async () => {
      throw new Error('Mail is down');
    });
    bus.subscribe('broken', handler);
    await bus.publish(ws, null, failing);

    let now = 0;
    await dispatcher.tick(at(now));
    for (const wait of RETRY_DELAYS_MS) {
      // A moment early, nothing; on time, one more try.
      await dispatcher.tick(at(now + wait - 1000));
      now += wait;
      await dispatcher.tick(at(now));
    }
    expect(handler).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(handler.mock.calls.at(-1)).toEqual([
      expect.objectContaining({ attempts: MAX_ATTEMPTS }),
    ]);
    await dispatcher.tick(at(now + 7 * 24 * 3_600_000));
    expect(handler).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('gives every subscriber its turn when one fails, and retries them all', async () => {
    const { bus, dispatcher } = setup();
    const broken = vi
      .fn(async () => {})
      .mockRejectedValueOnce(new Error('Not yet'));
    const fine = vi.fn(async () => {});
    bus.subscribe('broken', broken);
    bus.subscribe('fine', fine);
    await bus.publish(ws, null, failing);

    await dispatcher.tick(T0);
    expect(fine).toHaveBeenCalledTimes(1);
    await dispatcher.tick(at(RETRY_DELAYS_MS[0]!));
    expect(broken).toHaveBeenCalledTimes(2);
    expect(fine).toHaveBeenCalledTimes(2);
    await dispatcher.tick(at(24 * 3_600_000));
    expect(fine).toHaveBeenCalledTimes(2);
  });

  it('records an event once per key, and never throws', async () => {
    const { db, bus, dispatcher } = setup();
    const handler = vi.fn(async () => {});
    bus.subscribe('count', handler);
    const once = { dedupeKey: 'hudu-failing' };
    await bus.publish(ws, null, failing, once);
    await bus.publish(ws, null, failing, once);
    // Not an event, and a workspace that doesn't exist: logged, not thrown.
    await expect(
      bus.publish(ws, null, { type: 'nope' } as unknown as DomainEvent),
    ).resolves.toBeUndefined();
    vi.spyOn(db.events, 'append').mockRejectedValueOnce(new Error('Down'));
    await expect(bus.publish(ws, null, failing)).resolves.toBeUndefined();

    await dispatcher.tick(T0);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('gives up at once on an event it can’t read', async () => {
    const { db, bus, dispatcher } = setup();
    const handler = vi.fn(async () => {});
    bus.subscribe('count', handler);
    await db.events.append(ws, {
      id: 'evt-old',
      type: 'something.removed',
      actorUserId: null,
      payload: {},
      dedupeKey: null,
      occurredAt: T0,
    });
    await dispatcher.tick(T0);
    await dispatcher.tick(at(24 * 3_600_000));
    expect(handler).not.toHaveBeenCalled();
    await expect(
      db.events.claim(at(48 * 3_600_000), at(49 * 3_600_000), 10),
    ).resolves.toEqual([]);
  });

  it('publishes for a user in every workspace they belong to', async () => {
    const { bus, dispatcher } = setup();
    const handler = vi.fn<EventHandler>(async () => {});
    bus.subscribe('count', handler);
    const sam = demo.users[0]!;
    await bus.publishForUser(sam, {
      type: 'security.locked-out',
      userId: sam.id,
    });
    await dispatcher.tick(T0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({
      workspaceId: ws,
      actorUserId: null,
    });
  });
});
