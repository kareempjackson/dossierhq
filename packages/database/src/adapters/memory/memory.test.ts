import { demo } from '@dossierhq/fixtures';
import { describeDatabaseContract } from '../../testing/database.contract.js';
import { createMemoryAdapter } from './index.js';

describeDatabaseContract('memory', async () => createMemoryAdapter(demo));

describe('memory adapter', () => {
  it('starts empty without a seed', async () => {
    const db = createMemoryAdapter();
    await expect(db.clients.list(demo.workspace.id)).resolves.toEqual([]);
  });

  it('never writes through to the fixture it was seeded from', async () => {
    const db = createMemoryAdapter(demo);
    const [first] = demo.recommendations;
    await db.recommendations.update(demo.workspace.id, first!.id, {
      title: 'Changed',
    });
    expect(demo.recommendations[0]!.title).not.toBe('Changed');
  });
});
