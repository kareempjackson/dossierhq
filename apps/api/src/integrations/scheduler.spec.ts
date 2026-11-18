import type { Connector, Tool } from '@dossierhq/contracts';
import type { DatabaseAdapter, ToolRecords } from '@dossierhq/database';
import type { ConfigService } from '@nestjs/config';
import { WorkspaceActivity } from '../common/activity.js';
import type { AppConfig } from '../config/configuration.js';
import { SyncScheduler, syncDue } from './scheduler.js';
import { recordsFingerprint, type SyncService } from './sync.service.js';

const MINUTE = 60_000;
const NOW = Date.parse('2026-11-18T12:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * MINUTE).toISOString();

describe('syncDue', () => {
  const rule = { now: NOW, maxAgeMs: 15 * MINUTE, minGapMs: 15 * MINUTE };

  it('syncs data once it is old enough, and never-synced tools at once', () => {
    expect(syncDue({ status: 'healthy', lastSyncAt: ago(5) }, rule)).toBe(
      false,
    );
    expect(syncDue({ status: 'healthy', lastSyncAt: ago(15) }, rule)).toBe(
      true,
    );
    expect(syncDue({ status: 'healthy', lastSyncAt: null }, rule)).toBe(true);
  });

  it('retries a failing tool, and finishes one a restart cut short, however fresh', () => {
    expect(syncDue({ status: 'failing', lastSyncAt: ago(1) }, rule)).toBe(
      true,
    );
    expect(syncDue({ status: 'syncing', lastSyncAt: ago(1) }, rule)).toBe(
      true,
    );
  });

  it('never starts a tool again within the gap, even a failing one', () => {
    const tried = { ...rule, triedAt: NOW - 10 * MINUTE };
    expect(syncDue({ status: 'failing', lastSyncAt: null }, tried)).toBe(
      false,
    );
    expect(
      syncDue(
        { status: 'failing', lastSyncAt: null },
        { ...rule, triedAt: NOW - 15 * MINUTE },
      ),
    ).toBe(true);
  });
});

describe('SyncScheduler', () => {
  const connector = (
    tool: Tool,
    status: Connector['status'],
    lastSyncAt: string | null,
  ) => ({ tool, status, lastSyncAt }) as Connector;

  function setup(
    workspaces: Record<string, Connector[]>,
    { minutes = 15, hours = 4 } = {},
  ) {
    const started: string[] = [];
    const busy = new Set<string>();
    const sync = {
      busy: (ws: string, tool: Tool) => busy.has(`${ws}:${tool}`),
      sync: async (ws: string, tool: Tool) => {
        started.push(`${ws}:${tool}`);
      },
    } as unknown as SyncService;
    const db = {
      connectors: {
        list: async (ws: string) => workspaces[ws] ?? [],
        listAll: async () =>
          Object.entries(workspaces).flatMap(([workspaceId, cs]) =>
            cs.map((c) => ({ workspaceId, tool: c.tool })),
          ),
      },
    } as unknown as DatabaseAdapter;
    const config = {
      get: (key: keyof AppConfig) =>
        ({ SYNC_INTERVAL_MINUTES: minutes, SYNC_BACKUP_HOURS: hours })[
          key as 'SYNC_INTERVAL_MINUTES'
        ],
    } as unknown as ConfigService<AppConfig, true>;
    const activity = new WorkspaceActivity();
    const scheduler = new SyncScheduler(sync, db, activity, config);
    return { scheduler, activity, started, busy };
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('freshens a workspace in use: its tools older than the interval, and failing ones', async () => {
    const { scheduler, started } = setup({
      ws: [
        connector('ninjaone', 'healthy', ago(20)),
        connector('hudu', 'healthy', ago(5)),
        connector('fathom', 'failing', ago(300)),
      ],
    });
    await scheduler.freshen('ws');
    expect(started).toEqual(['ws:ninjaone', 'ws:fathom']);

    // A minute later nothing starts again, though both are still "old".
    vi.setSystemTime(NOW + MINUTE);
    await scheduler.freshen('ws');
    expect(started).toHaveLength(2);
  });

  it('leaves a workspace nobody uses until its data is SYNC_BACKUP_HOURS old', async () => {
    const { scheduler, started } = setup({
      quiet: [
        connector('ninjaone', 'healthy', ago(3 * 60)),
        connector('hudu', 'healthy', ago(4 * 60)),
      ],
      broken: [connector('ninjaone', 'failing', ago(30))],
    });
    await scheduler.look();
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(started.sort()).toEqual(['broken:ninjaone', 'quiet:hudu']);
  });

  it('never queues a tool this API is already syncing', async () => {
    const { scheduler, started, busy } = setup({
      ws: [connector('ninjaone', 'syncing', ago(60))],
    });
    busy.add('ws:ninjaone');
    await scheduler.freshen('ws');
    expect(started).toEqual([]);
  });

  it('syncs when someone uses the workspace, once started', async () => {
    const { scheduler, activity, started } = setup({
      ws: [connector('ninjaone', 'healthy', ago(60))],
    });
    activity.seen('ws');
    expect(started).toEqual([]);

    scheduler.onApplicationBootstrap();
    try {
      activity.seen('ws', NOW + 2 * MINUTE);
      await vi.waitFor(() => expect(started).toEqual(['ws:ninjaone']));
    } finally {
      scheduler.onApplicationShutdown();
    }
  });

  it('does nothing at all with automatic syncs off', async () => {
    const { scheduler, activity, started } = setup(
      { ws: [connector('ninjaone', 'failing', null)] },
      { minutes: 0 },
    );
    scheduler.onApplicationBootstrap();
    activity.seen('ws');
    await scheduler.freshen('ws');
    expect(started).toEqual([]);
  });
});

describe('WorkspaceActivity', () => {
  it('passes a workspace on at most once a minute', () => {
    const activity = new WorkspaceActivity();
    const heard: string[] = [];
    const stop = activity.onSeen((ws) => heard.push(ws));
    activity.seen('a', NOW);
    activity.seen('a', NOW + 30_000);
    activity.seen('b', NOW + 30_000);
    activity.seen('a', NOW + MINUTE);
    stop();
    activity.seen('a', NOW + 5 * MINUTE);
    expect(heard).toEqual(['a', 'b', 'a']);
  });
});

describe('recordsFingerprint', () => {
  const records = (sourceIds: string[]): ToolRecords => ({
    sources: sourceIds.map((id) => ({ id, title: `Source ${id}` })),
    devices: [],
    tickets: [],
    meetings: [],
    commitments: [],
    attention: [],
  }) as unknown as ToolRecords;

  it('is the same for the same records in any order, and differs when one changes', () => {
    expect(recordsFingerprint(records(['a', 'b']))).toBe(
      recordsFingerprint(records(['b', 'a'])),
    );
    expect(recordsFingerprint(records(['a', 'b']))).not.toBe(
      recordsFingerprint(records(['a', 'c'])),
    );
  });

  it('counts a time stamped "now" for want of one as unchanged', () => {
    const at = (time: string) =>
      ({
        ...records([]),
        sources: [{ id: 'web', recordedAt: time }],
      }) as unknown as ToolRecords;
    const first = '2026-11-18T12:00:00.000Z';
    const second = '2026-11-18T12:15:00.000Z';
    expect(recordsFingerprint(at(first), first)).toBe(
      recordsFingerprint(at(second), second),
    );
    // A real time that moved is a change.
    expect(recordsFingerprint(at(first), second)).not.toBe(
      recordsFingerprint(at(second), second),
    );
  });
});
