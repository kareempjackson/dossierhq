import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/**
 * Encrypts connector credentials at rest with AES-256-GCM. The key comes from
 * CONNECTOR_SECRET_KEY and never reaches the database; without it, tools can't
 * be connected and stored credentials can't be read.
 */
export class Secrets {
  constructor(private readonly key: Buffer | undefined) {}

  get available(): boolean {
    return this.key !== undefined;
  }

  encrypt(value: unknown): string {
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    const sealed = Buffer.concat([iv, cipher.getAuthTag(), body]);
    return `${VERSION}.${sealed.toString('base64url')}`;
  }

  /** Throws if the text was tampered with or sealed with another key. */
  decrypt(text: string): unknown {
    const key = this.requireKey();
    const [version, payload] = text.split('.');
    if (version !== VERSION || !payload) {
      throw new Error('Unrecognised credentials format');
    }
    const sealed = Buffer.from(payload, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      sealed.subarray(0, 12),
    );
    decipher.setAuthTag(sealed.subarray(12, 28));
    const body = Buffer.concat([
      decipher.update(sealed.subarray(28)),
      decipher.final(),
    ]);
    return JSON.parse(body.toString('utf8'));
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new Error('CONNECTOR_SECRET_KEY is not set');
    }
    return this.key;
  }
}
