import { timingSafeEqual } from 'node:crypto';

/** Compares a secret someone sent with the real one, in constant time. */
export function sameSecret(given: string, secret: string): boolean {
  const [x, y] = [Buffer.from(given), Buffer.from(secret)];
  return x.length === y.length && timingSafeEqual(x, y);
}
