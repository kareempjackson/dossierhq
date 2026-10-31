import { createHash } from 'node:crypto';

/** Sessions, password resets and invites store only this hash of the token. */
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
