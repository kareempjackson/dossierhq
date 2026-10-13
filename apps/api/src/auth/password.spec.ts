import { demo, DEMO_PASSWORD } from '@dossierhq/fixtures';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the password it hashed, and nothing else', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    await expect(
      verifyPassword('correct horse battery staple', hash),
    ).resolves.toBe(true);
    await expect(
      verifyPassword('correct horse battery stapler', hash),
    ).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects malformed hashes instead of throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$1$2$3$$')).resolves.toBe(false);
  });

  it('matches the seeded demo account', async () => {
    await expect(
      verifyPassword(DEMO_PASSWORD, demo.users[0]!.passwordHash),
    ).resolves.toBe(true);
  });
});
