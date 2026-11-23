import { NO_USAGE, type IntelligenceKind } from '@dossierhq/contracts';
import type { AiGuard, DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import { Secrets } from '../integrations/secrets.js';
import { IntelligenceService, limitOn } from './intelligence.service.js';
import {
  INTELLIGENCE_MODEL,
  IntelligenceFailure,
  type IntelligenceModel,
  type ModelRequest,
} from './model.js';
import { MODEL_CLIENTS, type ModelClients } from './model-clients.js';

const ws = demo.workspace.id;
const TRIAL = 6;
const SECRETS = new Secrets(Buffer.alloc(32, 7));
/** A dollar a run, on any model: enough to see a budget fill. */
const DOLLAR = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** Answers every request, or fails each with `failWith` while it's set. */
function fakeModel() {
  const state = {
    calls: 0,
    failWith: null as IntelligenceFailure | null,
    usage: DOLLAR,
  };
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      state.calls += 1;
      if (state.failWith) throw state.failWith;
      return { data: { ok: true } as T, usage: state.usage, model: req.model };
    },
  };
  return { model, state };
}

async function setup({ ownKey = false } = {}) {
  const shared = fakeModel();
  const own = fakeModel();
  const clients: ModelClients = {
    connect: () => own.model,
    check: async () => {},
  };
  const db: DatabaseAdapter = createMemoryAdapter(demo);
  const moduleRef = await Test.createTestingModule({
    providers: [
      IntelligenceService,
      { provide: DATABASE, useValue: db },
      { provide: INTELLIGENCE_MODEL, useValue: shared.model },
      { provide: MODEL_CLIENTS, useValue: clients },
      { provide: Secrets, useValue: SECRETS },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) =>
            key === 'AI_TRIAL_CALLS' ? TRIAL : 'claude-haiku-5-5',
        },
      },
    ],
  }).compile();
  const intelligence = moduleRef.get(IntelligenceService);
  if (ownKey) {
    await intelligence.addKey(ws, demo.users[0]!.id, 'anthropic', 'sk-own-1');
  }
  const run = (kind: IntelligenceKind) =>
    intelligence.run(ws, {
      kind,
      clientId: null,
      system: 's',
      context: 'c',
      task: 't',
      schema: z.object({ ok: z.boolean() }),
      effort: 'low',
    });
  return { db, intelligence, shared: shared.state, own: own.state, run };
}

const guard = (over: Partial<AiGuard> = {}): AiGuard => ({
  sharedCalls: 0,
  dailyBudget: null,
  spentToday: 0,
  pausedUntil: null,
  pausedReason: null,
  ...over,
});
const NOW = new Date('2026-11-22T10:00:00.000Z');

describe('limitOn', () => {
  it('ends the trial for everything, and Dossier’s own share at half', () => {
    const at = (sharedCalls: number, background: boolean) =>
      limitOn('shared', guard({ sharedCalls }), background, NOW, 20)?.reason ??
      null;
    expect(at(9, true)).toBeNull();
    expect(at(10, true)).toBe('trial');
    expect(at(10, false)).toBeNull();
    expect(at(19, false)).toBeNull();
    expect(at(20, false)).toBe('trial');
    // The trial is about Dossier's key: a workspace's own is never counted.
    expect(
      limitOn('own', guard({ sharedCalls: 99 }), true, NOW, 20),
    ).toBeNull();
  });

  it('stops Dossier’s own work at the day’s budget, not what people ask for', () => {
    const spent = (spentToday: number, dailyBudget: number | null) =>
      guard({ spentToday, dailyBudget });
    expect(limitOn('own', spent(9.99, null), true, NOW, 20)).toBeNull();
    expect(limitOn('own', spent(10, null), true, NOW, 20)?.reason).toBe(
      'budget',
    );
    expect(limitOn('own', spent(10, 25), true, NOW, 20)).toBeNull();
    expect(limitOn('own', spent(25, 25), true, NOW, 20)?.message).toContain(
      '$25',
    );
    expect(limitOn('own', spent(500, 25), false, NOW, 20)).toBeNull();
  });

  it('holds Dossier’s own work while it’s paused, and says until when', () => {
    const paused = guard({
      pausedUntil: '2026-11-22T10:15:00.000Z',
      pausedReason: 'No credit.',
    });
    const held = limitOn('own', paused, true, NOW, 20);
    expect(held?.reason).toBe('paused');
    expect(held?.message).toContain('10:15');
    expect(held?.message).toContain('No credit.');
    expect(limitOn('own', paused, false, NOW, 20)).toBeNull();
    const later = new Date('2026-11-22T10:15:00.000Z');
    expect(limitOn('own', paused, true, later, 20)).toBeNull();
  });
});

describe('AI limits on a workspace', () => {
  it('gives Dossier half the trial on its own key, people the rest, then asks for a key', async () => {
    const { intelligence, shared, run } = await setup();
    // Dossier's own work gets three of the six…
    for (let i = 0; i < 3; i++) await run('tickets');
    await expect(run('tickets')).rejects.toMatchObject({ rateLimited: true });
    await expect(run('recommendations')).rejects.toThrow(/yours to try/);
    expect(shared.calls).toBe(3);
    await expect(intelligence.waiting(ws)).resolves.toMatchObject({
      reason: 'trial',
    });
    await expect(intelligence.off(ws)).resolves.toBeNull();

    // …a person's questions and reports get the other three…
    for (let i = 0; i < 3; i++) await run('ask');
    expect(shared.calls).toBe(6);

    // …and then nothing runs on Dossier's key, for anyone.
    await expect(run('ask')).rejects.toThrow(/Add your own API key/);
    await expect(run('reports')).rejects.toThrow(/Add your own API key/);
    expect(shared.calls).toBe(6);
    await expect(intelligence.off(ws)).resolves.toMatch(/6 trial runs/);
    const { limits, enabled } = await intelligence.settings(ws);
    expect(limits.trial).toEqual({ used: 6, limit: 6 });
    expect(enabled).toBe(false);
  });

  it('counts only runs that worked toward the trial', async () => {
    const { intelligence, shared, run } = await setup();
    shared.failWith = new IntelligenceFailure('failed', 'A blip.');
    await expect(run('ask')).rejects.toThrow('A blip.');
    await expect(run('ask')).rejects.toThrow('A blip.');
    shared.failWith = null;
    await run('ask');
    expect((await intelligence.settings(ws)).limits.trial).toEqual({
      used: 1,
      limit: 6,
    });
  });

  it('runs on the workspace’s own key without a trial, up to its daily budget', async () => {
    const { db, intelligence, shared, own, run } = await setup({
      ownKey: true,
    });
    // A dollar a run on Haiku: a million output tokens at $1 per million… set
    // by spend instead, so the test doesn't lean on today's prices.
    await intelligence.setDailyBudget(ws, 2);
    for (let i = 0; i < 8; i++) await run('tickets');
    expect(own.calls).toBe(8);
    expect(shared.calls).toBe(0);
    expect((await intelligence.settings(ws)).limits).toMatchObject({
      trial: null,
      dailyBudget: 2,
      dailyBudgetChosen: 2,
      waiting: null,
    });

    // Spend reaches the budget: Dossier's own work waits for tomorrow…
    const day = new Date().toISOString().slice(0, 10);
    await db.aiBudget.record(
      ws,
      {
        id: 'run-big',
        clientId: null,
        kind: 'patterns',
        inputHash: null,
        model: 'claude-haiku-5-5',
        usage: NO_USAGE,
        cost: 2,
        status: 'ok',
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      },
      { owner: 'own', day, now: new Date().toISOString(), stop: false },
    );
    await expect(run('tickets')).rejects.toThrow(/budget of \$2 is spent/);
    await expect(intelligence.waiting(ws)).resolves.toMatchObject({
      reason: 'budget',
    });
    expect(own.calls).toBe(8);
    // …while a person's question still runs…
    await run('ask');
    expect(own.calls).toBe(9);
    // …and a bigger budget lets Dossier carry on.
    await intelligence.setDailyBudget(ws, null);
    await run('tickets');
    expect(own.calls).toBe(10);
    expect((await intelligence.settings(ws)).limits.dailyBudget).toBe(10);
  });

  it('pauses its own work after a failure the next run would repeat, until something changes', async () => {
    const { intelligence, own, run } = await setup({ ownKey: true });
    own.failWith = new IntelligenceFailure(
      'failed',
      'Anthropic says the account behind this key is out of credit.',
      NO_USAGE,
      true,
      true,
    );
    await expect(run('tickets')).rejects.toThrow(/out of credit/);
    expect(own.calls).toBe(1);
    // Nothing more is tried, however many tickets are waiting.
    for (let i = 0; i < 5; i++) {
      await expect(run('tickets')).rejects.toThrow(/paused its own drafting/);
    }
    await expect(run('themes')).rejects.toMatchObject({ rateLimited: true });
    expect(own.calls).toBe(1);
    await expect(intelligence.waiting(ws)).resolves.toMatchObject({
      reason: 'paused',
    });

    // A person may still try; when it works again, so does Dossier.
    await expect(run('ask')).rejects.toThrow(/out of credit/);
    own.failWith = null;
    await run('ask');
    await run('tickets');
    expect(own.calls).toBe(4);
    await expect(intelligence.waiting(ws)).resolves.toBeNull();
  });

  it('pauses after five failures in a row, and a new key ends the pause', async () => {
    const { intelligence, own, run } = await setup({ ownKey: true });
    own.failWith = new IntelligenceFailure('failed', 'Garbled answer.');
    for (let i = 0; i < 5; i++) {
      await expect(run('tickets')).rejects.toThrow('Garbled answer.');
    }
    await expect(run('tickets')).rejects.toThrow(/paused its own drafting/);
    expect(own.calls).toBe(5);

    own.failWith = null;
    await intelligence.addKey(ws, demo.users[0]!.id, 'anthropic', 'sk-own-2');
    await run('tickets');
    expect(own.calls).toBe(6);
  });
});
