import type {
  Recommendation,
  RecommendationUpdate,
} from '@dossierhq/contracts';
import type {
  DatabaseAdapter,
  RecommendationChanges,
} from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { notFound } from '../common/not-found.js';
import { DATABASE } from '../database/database.module.js';

@Injectable()
export class RecommendationsService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly clock: Clock,
  ) {}

  /**
   * Edits a recommendation. Accepting or dismissing stamps `decidedAt`;
   * moving back to draft (undo) clears it. Unless the update says otherwise,
   * accepting counts as a useful vote and dismissing as a not-useful one,
   * which steer what Dossier drafts; undo takes the vote back.
   */
  async update(
    workspaceId: string,
    id: string,
    update: RecommendationUpdate,
  ): Promise<Recommendation> {
    const changes: RecommendationChanges = {
      title: update.title,
      reason: update.reason,
      suggestedActions: update.suggestedActions,
      risk: update.risk,
      verification: update.verification,
      executive: update.executive,
      inReport: update.inReport,
      useful: update.useful,
    };
    if (update.status !== undefined) {
      changes.status = update.status;
      changes.decidedAt = update.status === 'draft' ? null : this.clock.now();
      if (update.useful === undefined) {
        changes.useful =
          update.status === 'accepted'
            ? true
            : update.status === 'dismissed'
              ? false
              : null;
      }
    }
    return (
      (await this.db.recommendations.update(workspaceId, id, changes)) ??
      notFound('Recommendation', id)
    );
  }
}
