import { demo } from '@dossierhq/fixtures';
import { describeDatabaseContract } from '../../testing/database.contract.js';
import { createMemoryAdapter } from './index.js';

describeDatabaseContract('memory', async () => createMemoryAdapter(demo));

describe('memory adapter', () => {
  it('starts empty without a seed', async () => {
    const db = createMemoryAdapter();
    await expect(db.clients.list(demo.workspace.id)).resolves.toEqual([]);
  });

  it('creates the first owner once, on an empty database', async () => {
    const db = createMemoryAdapter();
    const workspace = { id: 'acme-it', name: 'Acme IT', timeZone: 'UTC' };
    const user = {
      id: 'usr-ann',
      email: 'Ann@Acme.example',
      name: 'Ann Lee',
      title: 'Owner',
      passwordHash: 'hash',
    };
    await expect(db.users.any()).resolves.toBe(false);
    await expect(db.users.createFirstOwner(workspace, user)).resolves.toBe(
      true,
    );
    await expect(db.users.any()).resolves.toBe(true);
    await expect(db.workspaces.get('acme-it')).resolves.toEqual(workspace);
    await expect(db.users.findByEmail('ann@acme.example')).resolves.toEqual({
      ...user,
      email: 'ann@acme.example',
    });
    await expect(db.users.memberships('usr-ann')).resolves.toEqual([
      { workspaceId: 'acme-it', userId: 'usr-ann', role: 'owner' },
    ]);
    await expect(
      db.users.createFirstOwner(
        { ...workspace, id: 'second' },
        { ...user, id: 'usr-bob', email: 'bob@acme.example' },
      ),
    ).resolves.toBe(false);
    await expect(db.workspaces.get('second')).resolves.toBeNull();
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
