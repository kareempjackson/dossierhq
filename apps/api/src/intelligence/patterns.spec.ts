import {
  DEFAULT_MODEL,
  intelligencePreferencesSchema,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo } from '@dossierhq/fixtures';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DATABASE } from '../database/database.module.js';
import { Secrets } from '../integrations/secrets.js';
import {
  buildWorkspaceDigest,
  WorkspaceDigests,
  type DigestInput,
} from './digest.js';
import { IntelligenceService } from './intelligence.service.js';
import {
  INTELLIGENCE_MODEL,
  type IntelligenceModel,
  type ModelRequest,
} from './model.js';
import { MODEL_CLIENTS } from './model-clients.js';
import { ContextPacks, HandleBook } from './pack.js';
import { PatternFinder } from './patterns.js';

const ws = demo.workspace.id;
const NOW = new Date('2026-10-14T09:00:00.000Z');
const everything = intelligencePreferencesSchema.parse({}).records;
const USAGE = {
  inputTokens: 40_000,
  outputTokens: 2_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

function demoInput(): DigestInput {
  const copy = structuredClone(demo);
  return {
    clients: copy.clients,
    attention: copy.attentionItems,
    recommendations: copy.recommendations,
    meetings: copy.meetings,
    notes: [],
    tickets: copy.tickets,
    devices: copy.devices,
    sources: copy.sources,
  };
}

/** Each client's section in a digest, and the handles in it. */
function sectionsOf(text: string) {
  return text
    .split(/^# /m)
    .slice(1)
    .map((section) => ({
      clientId: /\(([^)]+)\)\n/.exec(section)![1]!,
      handles: [...section.matchAll(/S\d+/g)].map((m) => m[0]),
    }));
}

async function setup(answer: (req: ModelRequest<unknown>) => unknown) {
  const db = createMemoryAdapter(demo);
  const requests: ModelRequest<unknown>[] = [];
  const model: IntelligenceModel = {
    async generate<T>(req: ModelRequest<T>) {
      requests.push(req as ModelRequest<unknown>);
      return {
        data: answer(req as ModelRequest<unknown>) as T,
        usage: USAGE,
        model: req.model,
      };
    },
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      IntelligenceService,
      ContextPacks,
      WorkspaceDigests,
      PatternFinder,
      { provide: DATABASE, useValue: db },
      { provide: INTELLIGENCE_MODEL, useValue: model },
      { provide: MODEL_CLIENTS, useValue: null },
      { provide: Secrets, useValue: new Secrets(undefined) },
      { provide: ConfigService, useValue: { get: () => DEFAULT_MODEL } },
    ],
  }).compile();
  return {
    db: db as DatabaseAdapter,
    requests,
    finder: moduleRef.get(PatternFinder),
    digests: moduleRef.get(WorkspaceDigests),
  };
}

describe('workspace digest', () => {
  it('stays the same between syncs that change nothing real', () => {
    const before = buildWorkspaceDigest(demoInput(), NOW, everything);
    expect(before.text).toMatch(/^<workspace_records>\n/);
    expect(before.text).toContain('# Harbour Dental (harbour-dental)');
    expect(before.text).toContain(
      'File server backups have failed three nights running',
    );

    // A ticket updated, a laptop checking in, a patch now pending.
    const touched = demoInput();
    touched.tickets[0]!.updatedAt = '2026-10-14T08:59:00.000Z';
    const laptop = touched.devices.find((d) => d.type !== 'server')!;
    laptop.lastSeenAt = '2026-10-14T08:58:00.000Z';
    const current = touched.devices.find((d) => d.patchStatus === 'current')!;
    current.patchStatus = 'pending';
    expect(buildWorkspaceDigest(touched, NOW, everything).hash).toBe(
      before.hash,
    );
    // An hour later is the same day, and the same digest.
    expect(
      buildWorkspaceDigest(
        demoInput(),
        new Date(NOW.getTime() + 60 * 60 * 1000),
        everything,
      ).hash,
    ).toBe(before.hash);

    // Something real: a new alert.
    const changed = demoInput();
    changed.attention[0]!.title = 'Every backup has failed';
    expect(buildWorkspaceDigest(changed, NOW, everything).hash).not.toBe(
      before.hash,
    );
  });

  it('cites each client’s own records, and leaves out what isn’t shared', () => {
    const digest = buildWorkspaceDigest(demoInput(), NOW, everything);
    for (const section of sectionsOf(digest.text)) {
      for (const source of digest.book.sources(section.handles)) {
        expect(source.clientId).toBe(section.clientId);
      }
    }
    const without = buildWorkspaceDigest(demoInput(), NOW, {
      ...everything,
      tickets: false,
      devices: false,
    });
    expect(without.text).not.toContain('Open tickets:');
    expect(without.text).not.toContain('Out of support:');
    // The backup alert rests on NinjaOne device alerts, so it goes too.
    expect(without.text).not.toContain('backups have failed');
  });
});

describe('PatternFinder', () => {
  it('keeps patterns that rest on two clients’ own records, and drops the rest', async () => {
    const { db, finder, requests } = await setup((req) => {
      const [a, b, c] = sectionsOf(req.context).filter(
        (s) => s.handles.length > 0,
      );
      const entry = (s: typeof a, handle = s!.handles[0]!) => ({
        clientId: s!.clientId,
        detail: `At ${s!.clientId}`,
        sources: [handle],
      });
      return {
        patterns: [
          {
            title: 'Two clients share this',
            why: 'Both have it.',
            suggestion: 'Fix it once.',
            // The same client twice is still one client.
            clients: [entry(a), entry(b), entry(b)],
          },
          {
            title: 'Only one client has this',
            why: 'Just one.',
            suggestion: 'Nothing to share.',
            clients: [entry(a)],
          },
          {
            title: 'Claims another client’s record',
            why: 'Mixed up.',
            suggestion: 'No.',
            clients: [entry(a, b!.handles[0]), entry(c)],
          },
          {
            title: 'Cites a record it was never shown',
            why: 'Made up.',
            suggestion: 'No.',
            clients: [entry(a), entry(b, 'S999')],
          },
        ],
      };
    });
    await expect(finder.find(ws, { force: true })).resolves.toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.context).toContain('<workspace_records>');

    const patterns = await db.patterns.list(ws);
    expect(patterns.map((p) => p.title)).toEqual(['Two clients share this']);
    const [pattern] = patterns;
    expect(pattern!.clients).toHaveLength(2);
    const sources = await db.sources.getMany(
      ws,
      pattern!.clients.flatMap((c) => c.sourceIds),
    );
    for (const part of pattern!.clients) {
      for (const id of part.sourceIds) {
        expect(sources.find((s) => s.id === id)?.clientId).toBe(part.clientId);
      }
    }
    // The next run is told what it found, to keep the wording.
    await finder.find(ws, { force: true });
    expect(requests[1]!.task).toContain('- Two clients share this');
  });

  it('looks again after 6 hours when records changed, and after a day when not', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(NOW);
      const { db, finder, digests, requests } = await setup(() => ({
        patterns: [],
      }));
      let hash = 'first';
      vi.spyOn(digests, 'build').mockImplementation(async () => ({
        text: '<workspace_records>\n</workspace_records>',
        hash,
        book: new HandleBook(),
      }));
      const hours = (n: number) =>
        vi.setSystemTime(NOW.getTime() + n * 3_600_000);

      await expect(finder.find(ws)).resolves.toBe(true);
      hours(1);
      await expect(finder.find(ws)).resolves.toBe(false);
      hash = 'second';
      hours(5);
      await expect(finder.find(ws)).resolves.toBe(false);
      hours(7);
      await expect(finder.find(ws)).resolves.toBe(true);
      // Unchanged since: only once a day.
      hours(20);
      await expect(finder.find(ws)).resolves.toBe(false);
      hours(32);
      await expect(finder.find(ws)).resolves.toBe(true);
      expect(requests).toHaveLength(3);

      // Turned off: never, even when asked.
      await db.intelligence.setPreferences(ws, {
        outputs: { patterns: false },
      });
      await expect(finder.find(ws, { force: true })).resolves.toBe(false);
      expect(requests).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
