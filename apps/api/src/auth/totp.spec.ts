import {
  base32Decode,
  base32Encode,
  hashRecoveryCode,
  hotp,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  stepAt,
  totpUri,
} from './totp.js';

// RFC 6238 appendix B, SHA-1: the ASCII secret "12345678901234567890". The
// RFC prints 8 digits; authenticator apps show the last 6.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('TOTP', () => {
  it('makes the codes RFC 6238 gives', () => {
    const key = base32Decode(RFC_SECRET);
    for (const [seconds, code] of RFC_VECTORS) {
      expect(hotp(key, stepAt(seconds * 1000))).toBe(code);
    }
  });

  it('round-trips base32 and ignores spaces, case and padding', () => {
    const bytes = Buffer.from('any bytes at all, 123');
    const text = base32Encode(bytes);
    expect(base32Decode(text)).toEqual(bytes);
    expect(base32Decode(` ${text.toLowerCase()}== `)).toEqual(bytes);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('accepts a code from one step either side of now, and says which', () => {
    const now = 1_234_567_890_000;
    const key = base32Decode(RFC_SECRET);
    const at = (step: number) => hotp(key, step);
    const step = stepAt(now);
    expect(matchTotp(RFC_SECRET, at(step), now)).toBe(step);
    expect(matchTotp(RFC_SECRET, at(step - 1), now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, at(step + 1), now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, at(step - 2), now)).toBeNull();
    expect(matchTotp(RFC_SECRET, '12345', now)).toBeNull();
    expect(matchTotp(RFC_SECRET, 'abcdef', now)).toBeNull();
  });

  it('builds the URI authenticator apps read', () => {
    expect(totpUri('ABC234', 'sam@larkspur-it.example')).toBe(
      'otpauth://totp/Dossier:sam%40larkspur-it.example?secret=ABC234&issuer=Dossier&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('makes ten distinct recovery codes, hashed whatever their formatting', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    expect(hashRecoveryCode('ABCDE-fghij')).toBe(
      hashRecoveryCode(' abcde fghij '),
    );
  });
});
