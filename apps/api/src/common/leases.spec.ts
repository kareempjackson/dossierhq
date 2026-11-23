import { demo } from '@dossierhq/fixtures';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { WorkLeases } from './leases.js';

const ws = demo.workspace.id;

// Two API processes on one database: each has its own WorkLeases.
describe('WorkLeases', () => {
  function twoProcesses() {
    const db = createMemoryAdapter(demo);
    return { db, a: new WorkLeases(db), b: new WorkLeases(db) };
  }

  it('lets one process do a job while the other stands down', async () => {
    const { a, b } = twoProcesses();
    let release!: () => void;
    const working = new Promise<void>((resolve) => (release = resolve));
    const first = a.run(ws, 'intelligence', () => working.then(() => 'done'));
    // Give the first its claim, then the second asks for the same job.
    await new Promise((resolve) => setTimeout(resolve, 0));
    let ranTwice = false;
    await expect(
      b.run(ws, 'intelligence', async () => {
        ranTwice = true;
      }),
    ).resolves.toEqual({ ran: false });
    expect(ranTwice).toBe(false);
    await expect(b.held(ws)).resolves.toEqual(['intelligence']);

    release();
    await expect(first).resolves.toEqual({ ran: true, value: 'done' });
    // Released: the other may have it now.
    await expect(a.held(ws)).resolves.toEqual([]);
    await expect(b.run(ws, 'intelligence', async () => 2)).resolves.toEqual({
      ran: true,
      value: 2,
    });
  });

  it('releases a job whose work throws, and keeps other jobs apart', async () => {
    const { a, b } = twoProcesses();
    await expect(
      a.run(ws, 'sync:hudu', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(b.held(ws)).resolves.toEqual([]);

    const both = await Promise.all([
      a.run(ws, 'sync:hudu', async () => 'a'),
      b.run(ws, 'sync:fathom', async () => 'b'),
    ]);
    expect(both).toEqual([
      { ran: true, value: 'a' },
      { ran: true, value: 'b' },
    ]);
  });

  it('holds a job off for every process until a time', async () => {
    const { a, b } = twoProcesses();
    await a.holdOff(ws, 'sync-retry:hudu', new Date(Date.now() + 60_000));
    await expect(b.held(ws)).resolves.toEqual(['sync-retry:hudu']);
    await a.holdOff(ws, 'sync-retry:fathom', new Date(Date.now() - 1));
    await expect(b.held(ws)).resolves.toEqual(['sync-retry:hudu']);
  });
});
