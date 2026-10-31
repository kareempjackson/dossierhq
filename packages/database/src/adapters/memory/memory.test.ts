import { demo } from '@dossierhq/fixtures';
import { describeDatabaseContract } from '../../testing/database.contract.js';
import { createMemoryAdapter } from './index.js';

describeDatabaseContract('memory', async () => createMemoryAdapter(demo));

describe('memory adapter', () => {
  it('starts empty without a seed', async () => {
    const db = createMemoryAdapter();
    await expect(db.clients.list(demo.workspace.id)).resolves.toEqual([]);
  });

  it('creates a workspace with its owner for each confirmed sign-up', async () => {
    const db = createMemoryAdapter();
    const at = '2030-01-01T00:00:00.000Z';
    const signUp = (tokenHash: string, email: string) => ({
      tokenHash,
      email,
      passwordHash: `${tokenHash}-hash`,
      browserHash: null,
      timeZone: 'UTC',
      createdAt: at,
      expiresAt: '2030-01-02T00:00:00.000Z',
    });
    const workspace = { id: 'acme-it', name: 'Acme IT', timeZone: 'UTC' };
    const ann = { id: 'usr-ann', name: 'Ann Lee', title: 'Owner' };
    await db.signUps.save(signUp('ann-link', 'Ann@Acme.example'));
    await expect(
      db.signUps.complete('ann-link', workspace, ann, at),
    ).resolves.toBe('created');
    await expect(db.workspaces.get('acme-it')).resolves.toEqual(workspace);
    await expect(db.users.findByEmail('ann@acme.example')).resolves.toEqual({
      ...ann,
      email: 'ann@acme.example',
      passwordHash: 'ann-link-hash',
    });
    await expect(db.users.memberships('usr-ann')).resolves.toEqual([
      { workspaceId: 'acme-it', userId: 'usr-ann', role: 'owner' },
    ]);

    await db.signUps.save(signUp('bob-link', 'bob@acme.example'));
    await expect(
      db.signUps.complete(
        'bob-link',
        { ...workspace, id: 'second' },
        { ...ann, id: 'usr-bob' },
        at,
      ),
    ).resolves.toBe('created');
    await expect(db.users.memberships('usr-bob')).resolves.toEqual([
      { workspaceId: 'second', userId: 'usr-bob', role: 'owner' },
    ]);
    await expect(db.clients.list('second')).resolves.toEqual([]);
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
