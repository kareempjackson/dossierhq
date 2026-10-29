import type { Pattern, PatternClient } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS, oneLine, stableHash } from '../integrations/ids.js';
import { WorkspaceDigests } from './digest.js';
import { IntelligenceService } from './intelligence.service.js';
import { PATTERNS_SYSTEM } from './prompts.js';

/** Most patterns kept from one run. */
const MAX_PATTERNS = 6;
/** Fewer clients than this have nothing to compare. */
const MIN_CLIENTS = 3;
/** When records changed, at most this often. */
const CHANGED_EVERY_MS = 6 * 60 * 60 * 1000;
/** When they didn't, once a day. */
const UNCHANGED_EVERY_MS = DAY_MS;
/** After a failure, this long before another try. */
const RETRY_AFTER_MS = 60 * 60 * 1000;

const patternsSchema = z.object({
  patterns: z.array(
    z.object({
      title: z
        .string()
        .describe(
          'The pattern in one line, naming what the clients share, e.g. "Windows 10 PCs still in use at three clients".',
        ),
      why: z
        .string()
        .describe('Why it matters across these clients, in one or two lines.'),
      suggestion: z
        .string()
        .describe(
          'What the MSP could do once for all of them, in one line, starting with a verb.',
        ),
      clients: z.array(
        z.object({
          clientId: z.string().describe('The client’s ID, from its heading.'),
          detail: z
            .string()
            .describe('What it looks like at this client, in one line.'),
          sources: z
            .array(z.string())
            .describe(
              'Handles from this client’s own section that show it, such as "S3".',
            ),
        }),
      ),
    }),
  ),
});

function task(previous: Pattern[], today: string): string {
  return [
    `Today is ${today}.`,
    '',
    `Task: find patterns across these clients: problems, risks or requests that show up at two or more of them, that the MSP could deal with once for all of them. At most ${MAX_PATTERNS}, most important first. Fewer is better than stretching; return an empty list if there are none.`,
    '',
    'For each one give:',
    '- title: the pattern in one line, naming what the clients share.',
    '- why: why it matters across them, with the facts and dates that make it worth acting on.',
    '- suggestion: what the MSP could do once for all of them, starting with a verb.',
    '- clients: each client it shows up at: its ID from the heading, what it looks like there in one line, and the handles from that client’s section that show it.',
    ...(previous.length > 0
      ? [
          '',
          'You found these last time. Keep any that still hold, in the same words:',
          ...previous.map((p) => `- ${oneLine(p.title)}`),
        ]
      : []),
  ].join('\n');
}

/**
 * Finds what several clients have in common, from a digest of every
 * client's records. Each pattern rests on records of at least two clients;
 * which client a record belongs to comes from the record, never from what
 * the model says.
 */
@Injectable()
export class PatternFinder {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
    private readonly digests: WorkspaceDigests,
  ) {}

  /**
   * Looks again when the records changed and it last looked 6 hours ago,
   * or a day ago if they didn't; `force` looks now. Returns whether the
   * model was asked.
   */
  async find(
    workspaceId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<boolean> {
    if (!(await this.intelligence.isOn(workspaceId, 'patterns'))) return false;
    const clients = await this.db.clients.list(workspaceId);
    if (clients.length < MIN_CLIENTS) return false;
    const digest = await this.digests.build(workspaceId);
    if (!force) {
      const last = await this.db.intelligence.lastRun(
        workspaceId,
        'patterns',
        null,
      );
      if (last) {
        const wait =
          last.status !== 'ok'
            ? RETRY_AFTER_MS
            : last.inputHash === digest.hash
              ? UNCHANGED_EVERY_MS
              : CHANGED_EVERY_MS;
        if (Date.now() - Date.parse(last.startedAt) < wait) return false;
      }
    }

    const previous = await this.db.patterns.list(workspaceId);
    const now = new Date().toISOString();
    const runId = `run-${randomUUID()}`;
    const answer = await this.intelligence.run(workspaceId, {
      id: runId,
      kind: 'patterns',
      clientId: null,
      inputHash: digest.hash,
      system: PATTERNS_SYSTEM,
      context: digest.text,
      task: task(previous, now.slice(0, 10)),
      schema: patternsSchema,
      effort: 'medium',
    });

    const patterns: Pattern[] = answer.patterns.flatMap((found, index) => {
      const byClient = new Map<string, PatternClient>();
      for (const claimed of found.clients) {
        // Only the handles that are really this client's records count.
        const sourceIds = digest.book
          .sources(claimed.sources)
          .filter((s) => s.clientId === claimed.clientId)
          .map((s) => s.id);
        if (sourceIds.length === 0) continue;
        const known = byClient.get(claimed.clientId);
        byClient.set(claimed.clientId, {
          clientId: claimed.clientId,
          detail: known?.detail ?? oneLine(claimed.detail, 240),
          sourceIds: [...new Set([...(known?.sourceIds ?? []), ...sourceIds])],
        });
      }
      const title = oneLine(found.title, 160);
      if (!title || byClient.size < 2) return [];
      return [
        {
          id: `pat-${stableHash(runId, index)}`,
          title,
          why: oneLine(found.why, 400),
          suggestion: oneLine(found.suggestion, 240),
          clients: [...byClient.values()],
          createdAt: now,
        },
      ];
    });
    await this.db.patterns.replace(
      workspaceId,
      patterns.slice(0, MAX_PATTERNS),
    );
    return true;
  }
}
