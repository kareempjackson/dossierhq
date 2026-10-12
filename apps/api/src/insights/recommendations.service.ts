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
   * moving back to draft (undo) clears it.
   */
  async update(
    workspaceId: string,
    id: string,
    update: RecommendationUpdate,
  ): Promise<Recommendation> {
    const changes: RecommendationChanges = {
      title: update.title,
      reason: update.reason,
    };
    if (update.status !== undefined) {
      changes.status = update.status;
      changes.decidedAt = update.status === 'draft' ? null : this.clock.now();
    }
    return (
      (await this.db.recommendations.update(workspaceId, id, changes)) ??
      notFound('Recommendation', id)
    );
  }
}
