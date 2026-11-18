import type { DatabaseAdapter } from '@dossierhq/database';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { RateLimits } from '../auth/rate-limits.js';
import { DATABASE } from '../database/database.module.js';

/**
 * The public site's product-updates list. Nothing is sent from it yet; it
 * only keeps who asked, where and when.
 */
@Injectable()
export class ProductUpdatesService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly limits: RateLimits,
  ) {}

  /**
   * Adds them to the list, the same whether they were on it already, so it
   * never says who is. Limited per address and per email, so a script can't
   * fill the list. Saved before answering: a failed save isn't a yes.
   */
  async subscribe(
    email: string,
    source: string | null,
    ip: string | null,
  ): Promise<void> {
    if (
      await this.limits.blocked(['updates-ip', ip], ['updates-email', email])
    ) {
      throw new HttpException(
        'Too many sign-ups from here. Try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.limits.hit(['updates-ip', ip], ['updates-email', email]);
    // Real time, not the pinned test clock: this records when they asked.
    await this.db.productUpdates.subscribe({
      email,
      source,
      createdAt: new Date().toISOString(),
    });
  }
}
