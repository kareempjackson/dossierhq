import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Time-based one-time codes (RFC 6238) as authenticator apps make them:
 * HMAC-SHA1, 6 digits, a new code every 30 seconds.
 */
export const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let value = 0;
  let bits = 0;
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const char of text.toUpperCase().replace(/[\s=-]/g, '')) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('Not base32');
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new secret for an authenticator app: 20 random bytes, base32. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** What a QR code holds for an authenticator app to add the account. */
export function totpUri(secret: string, account: string, issuer = 'Dossier') {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}

/** The code for one counter value (RFC 4226). */
export function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', key).update(message).digest();
  const offset = hash[hash.length - 1]! & 0xf;
  const number =
    ((hash[offset]! & 0x7f) << 24) |
    (hash[offset + 1]! << 16) |
    (hash[offset + 2]! << 8) |
    hash[offset + 3]!;
  return String(number % 10 ** DIGITS).padStart(DIGITS, '0');
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * The step a 6-digit code belongs to, allowing one step either side of now
 * for a phone's clock being a little out; null when it matches none.
 */
export function matchTotp(
  secret: string,
  code: string,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const given = Buffer.from(code);
  const current = stepAt(now);
  for (const step of [current, current - 1, current + 1]) {
    if (timingSafeEqual(Buffer.from(hotp(key, step)), given)) return step;
  }
  return null;
}

/** Ten recovery codes, each 10 characters in two groups, e.g. "k7m2q-x9p4a". */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const code = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

/** Stored instead of the code; ignores case, spaces and dashes. */
export const hashRecoveryCode = (code: string) =>
  createHash('sha256')
    .update(code.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .digest('hex');
