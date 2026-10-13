import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt, at OWASP's recommended cost
 * (N=2^17, r=8, p=1). Stored as `scrypt$N$r$p$salt$hash`, base64url, so the
 * cost can be raised later without breaking existing hashes.
 */
const COST = { N: 2 ** 17, r: 8, p: 1 };
const MAXMEM = 256 * 1024 * 1024;
const KEY_LENGTH = 32;

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize('NFKC'),
      salt,
      keyLength,
      { ...options, maxmem: MAXMEM },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(
  password: string,
  salt: Buffer = randomBytes(16),
): Promise<string> {
  const key = await derive(password, salt, KEY_LENGTH, COST);
  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** Constant-time check. False for a wrong password or a malformed hash. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  try {
    const actual = await derive(
      password,
      Buffer.from(salt, 'base64url'),
      expected.length,
      {
        N: Number(n),
        r: Number(r),
        p: Number(p),
      },
    );
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
