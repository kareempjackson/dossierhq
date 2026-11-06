import 'server-only';
import type { InvitePreview } from '@dossierhq/contracts';
import { previewInvite as preview } from './data/auth';

export type { InvitePreview };

/**
 * The invite behind a link, or null when it can't be used (expired,
 * withdrawn, already used, or its workspace is suspended). Needs no session.
 */
export function previewInvite(token: string): Promise<InvitePreview | null> {
  return preview(token);
}
