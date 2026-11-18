import 'server-only';
import type { ProductUpdatesSignup } from '@dossierhq/contracts';
import { ApiError, apiSend } from '../api';

export type UpdatesResult =
  { ok: true } | { ok: false; reason: 'invalid' | 'limited' | 'unavailable' };

/**
 * Puts an address on the product-updates list. The API answers the same
 * whether it was on the list already. Never throws for a 4xx.
 */
export async function subscribeToUpdates(
  signup: ProductUpdatesSignup,
): Promise<UpdatesResult> {
  try {
    await apiSend('POST', '/product-updates', signup, undefined, {
      session: 'none',
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return { ok: false, reason: 'limited' };
    }
    if (error instanceof ApiError && error.status === 400) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}
