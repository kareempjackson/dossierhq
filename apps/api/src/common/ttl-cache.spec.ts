import { describe, expect, it } from 'vitest';
import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  it('loads once until the entry runs out or is forgotten', async () => {
    let at = 0;
    let loads = 0;
    const cache = new TtlCache<number>(1_000, () => at);
    const load = () => Promise.resolve(++loads);

    await expect(cache.get('a', load)).resolves.toBe(1);
    await expect(cache.get('a', load)).resolves.toBe(1);
    await expect(cache.get('b', load)).resolves.toBe(2);
    at = 1_000;
    await expect(cache.get('a', load)).resolves.toBe(3);
    cache.forget('a');
    await expect(cache.get('a', load)).resolves.toBe(4);
  });

  it('does not keep a failed load', async () => {
    const cache = new TtlCache<number>(1_000);
    await expect(
      cache.get('a', () => Promise.reject(new Error('down'))),
    ).rejects.toThrow('down');
    await expect(cache.get('a', () => Promise.resolve(7))).resolves.toBe(7);
  });
});
