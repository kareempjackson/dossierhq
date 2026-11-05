import type { Recommendation } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RateLimits } from '../auth/rate-limits.js';
import { notFound } from '../common/not-found.js';
import { DATABASE } from '../database/database.module.js';
import { oneLine } from '../integrations/ids.js';
import { IntelligenceFailure } from './model.js';
import { IntelligenceService, turnedOff } from './intelligence.service.js';
import { ContextPacks, HandleBook } from './pack.js';
import { DOSSIER_SYSTEM } from './prompts.js';
import { executiveBrief, executiveOutputSchema } from './styles.js';

const rewriteSchema = z.object({ executive: executiveOutputSchema });

function task(rec: Recommendation, handles: string, today: string): string {
  return [
    `Today is ${today}.`,
    '',
    'Task: write the executive version of one recommendation for this client, for the client’s owner, CEO or practice manager. The MSP’s team has the technical version below, and may have reworded it: keep to what it says, and to the records it rests on.',
    '',
    `Title: ${oneLine(rec.title, 200)}`,
    `Why: ${oneLine(rec.reason, 1_000)}`,
    ...(rec.suggestedActions.length > 0
      ? [
          'Steps:',
          ...rec.suggestedActions.map((step) => `- ${oneLine(step, 300)}`),
        ]
      : []),
    ...(rec.risk ? [`Risk: ${oneLine(rec.risk, 500)}`] : []),
    ...(rec.verification
      ? [`To confirm it worked: ${oneLine(rec.verification, 500)}`]
      : []),
    `It rests on: ${handles || 'the records above'}`,
    '',
    'Give executive: a headline, two to four points (what it means for the business, what we recommend, how disruptive it is) and the decision needed from them, or null (not the word "None") when nothing is needed. Nothing in it comes from internal notes.',
  ].join('\n');
}

/**
 * Writes one recommendation's executive version again, from its technical
 * version and the client's records: for drafts made before there were two
 * styles, ones whose executive version was dropped, and ones the team
 * reworded since. Dossier's rewrite isn't a person's edit.
 */
@Injectable()
export class ExecutiveWriter {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly intelligence: IntelligenceService,
    private readonly packs: ContextPacks,
    private readonly limits: RateLimits,
  ) {}

  async rewrite(
    workspaceId: string,
    userId: string,
    id: string,
  ): Promise<Recommendation> {
    const rec =
      (await this.db.recommendations.get(workspaceId, id)) ??
      notFound('Recommendation', id);
    const off = await this.intelligence.off(workspaceId);
    if (off) throw new ServiceUnavailableException(off);
    if (!(await this.intelligence.isOn(workspaceId, 'recommendations'))) {
      throw new ConflictException(turnedOff('recommendations'));
    }
    if (await this.limits.blocked(['rewrite', userId])) {
      throw new HttpException(
        'You’ve asked for a lot of rewrites in the last hour. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const book = new HandleBook();
    const pack = await this.packs.forClient(workspaceId, rec.clientId, book);
    if (!pack) notFound('Client', rec.clientId);
    // The pack numbered every source it shows, so these are its handles.
    const sources = await this.db.sources.getMany(workspaceId, rec.sourceIds);
    const handles = book.cite(sources).replace(/[[\]]/g, '').trim();

    await this.limits.hit(['rewrite', userId]);
    let written: z.infer<typeof rewriteSchema>;
    try {
      written = await this.intelligence.run(workspaceId, {
        id: `run-${randomUUID()}`,
        kind: 'recommendations',
        // Not the client's: its drafting runs say whether to draft again.
        clientId: null,
        system: DOSSIER_SYSTEM,
        context: pack.text,
        task: task(rec, handles, new Date().toISOString().slice(0, 10)),
        schema: rewriteSchema,
        effort: 'low',
      });
    } catch (error) {
      if (error instanceof IntelligenceFailure) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }

    const executive = executiveBrief(written.executive, pack.internalTexts);
    if (!executive) {
      throw new UnprocessableEntityException(
        'Dossier couldn’t write an executive version that leaves out the team’s internal notes. Try again, or write it yourself.',
      );
    }
    return (
      (await this.db.recommendations.update(workspaceId, id, {
        executive,
        byDossier: true,
      })) ?? notFound('Recommendation', id)
    );
  }
}
