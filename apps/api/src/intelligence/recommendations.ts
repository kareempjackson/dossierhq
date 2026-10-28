import {
  INTELLIGENCE_TOPICS,
  type IntelligencePreferences,
  type Recommendation,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS, oneLine, stableHash } from '../integrations/ids.js';
import { IntelligenceService } from './intelligence.service.js';
import { ContextPacks } from './pack.js';
import { DOSSIER_SYSTEM } from './prompts.js';

/** Most drafts a client gets at once. */
const MAX_DRAFTS = 5;
/** Unchanged records are drafted from again after this long. */
const REDRAFT_AFTER_MS = DAY_MS;
/** After a failure, unchanged records wait this long before another try. */
const RETRY_AFTER_MS = 60 * 60 * 1000;
/** How many decided recommendations the model is shown, to avoid repeats. */
const DECIDED_SHOWN = 30;

/** Titles compared loosely: case and punctuation aside. */
const wordsOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const draftsSchema = z.object({
  recommendations: z.array(
    z.object({
      title: z
        .string()
        .describe(
          'The action, in one line, starting with a verb and naming what it is about.',
        ),
      reason: z
        .string()
        .describe('Why, in one line, with the facts and dates behind it.'),
      sources: z
        .array(z.string())
        .describe('Handles of the records it rests on, such as "S3".'),
    }),
  ),
});

function task(
  existing: Recommendation[],
  today: string,
  topics: IntelligencePreferences['topics'],
): string {
  const wanted = INTELLIGENCE_TOPICS.filter((topic) => topics[topic.id]);
  const unwanted = INTELLIGENCE_TOPICS.filter((topic) => !topics[topic.id]);
  const about = (list: typeof INTELLIGENCE_TOPICS) =>
    list.map((topic) => `- ${topic.name}: ${topic.description}`).join('\n');
  const decided = existing
    .filter((rec) => rec.status !== 'draft')
    .slice(0, DECIDED_SHOWN);
  const waiting = existing.filter((rec) => rec.status === 'draft');
  const list = (recs: Recommendation[]) =>
    recs.map((rec) => `- (${rec.status}) ${oneLine(rec.title)}`).join('\n');
  return [
    `Today is ${today}.`,
    '',
    `Task: suggest what the MSP should do next for this client: at most ${MAX_DRAFTS} actions, most important first. Only suggest an action when the records give a clear reason for it: something urgent, failing, overdue, at risk, about to expire, happening again and again, or promised to the client. Fewer is better than padding. Return an empty list if nothing needs doing.`,
    '',
    'For each one give:',
    '- title: the action, in one line, starting with a verb and naming the device, person or thing (for example "Replace the failing disk in HD-FS01").',
    '- reason: why, in one line, with the facts and dates that make it worth doing now.',
    '- sources: the handles of every record it rests on.',
    ...(decided.length > 0
      ? [
          '',
          'The team has already accepted or dismissed these. Don’t suggest them again, or the same thing in other words:',
          list(decided),
        ]
      : []),
    ...(waiting.length > 0
      ? [
          '',
          'These drafts are waiting for the team. Your list replaces them, so include any that still apply, in the same words:',
          list(waiting),
        ]
      : []),
    ...(unwanted.length > 0
      ? [
          '',
          'The team only wants suggestions about:',
          about(wanted),
          'Don’t suggest anything that is mainly about:',
          about(unwanted),
        ]
      : []),
  ].join('\n');
}

/** Drafts a client's recommendations from its records. */
@Injectable()
export class RecommendationDrafter {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
    private readonly packs: ContextPacks,
  ) {}

  /**
   * Drafts afresh unless the client's records are the same as at the last
   * run, and that run was recent. Returns whether the model was asked.
   */
  async draft(
    workspaceId: string,
    clientId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<boolean> {
    const { outputs, topics } =
      await this.intelligence.preferences(workspaceId);
    // Turned off, or nothing left to look for: no call, no cost.
    if (!outputs.recommendations || !Object.values(topics).some(Boolean)) {
      return false;
    }
    const pack = await this.packs.forClient(workspaceId, clientId);
    if (!pack) return false;
    if (!force) {
      const last = await this.db.intelligence.lastRun(
        workspaceId,
        'recommendations',
        clientId,
      );
      const age = last ? Date.now() - Date.parse(last.startedAt) : Infinity;
      const wait = last?.status === 'ok' ? REDRAFT_AFTER_MS : RETRY_AFTER_MS;
      if (last?.inputHash === pack.hash && age < wait) return false;
    }

    const existing = await this.db.recommendations.list(workspaceId, {
      clientId,
    });
    const now = new Date().toISOString();
    const runId = `run-${randomUUID()}`;
    const answer = await this.intelligence.run(workspaceId, {
      id: runId,
      kind: 'recommendations',
      clientId,
      inputHash: pack.hash,
      system: DOSSIER_SYSTEM,
      context: pack.text,
      task: task(existing, now.slice(0, 10), topics),
      schema: draftsSchema,
      effort: 'medium',
    });

    const decided = new Set(
      existing
        .filter((rec) => rec.status !== 'draft')
        .map((rec) => wordsOf(rec.title)),
    );
    const drafts: Recommendation[] = answer.recommendations
      .slice(0, MAX_DRAFTS)
      .flatMap((suggestion, index) => {
        const title = oneLine(suggestion.title, 160);
        const sourceIds = pack.sourceIds(suggestion.sources);
        // Uncited, empty, or something the team already decided on.
        if (!title || sourceIds.length === 0) return [];
        if (decided.has(wordsOf(title))) return [];
        return [
          {
            id: `rec-${stableHash(runId, index)}`,
            clientId,
            status: 'draft',
            title,
            reason: oneLine(suggestion.reason, 300),
            createdAt: now,
            decidedAt: null,
            sourceIds,
          },
        ];
      });
    await this.db.recommendations.replaceDrafts(
      workspaceId,
      clientId,
      runId,
      drafts,
    );
    return true;
  }
}
