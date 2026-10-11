import type { DatabaseAdapter } from '../types.js';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/**
 * The behaviour every adapter must share. Each adapter's test file runs this
 * suite; a new adapter is ready to plug in once it passes.
 *
 * The suite only touches rows it creates, so it is safe against a dev database.
 */
export function describeNotesRepositoryContract(
  name: string,
  setup: () => Promise<DatabaseAdapter>,
  { skip = false }: { skip?: boolean } = {},
) {
  describe.skipIf(skip)(`${name} adapter — NotesRepository contract`, () => {
    let db: DatabaseAdapter;
    const createdIds = new Set<string>();

    beforeAll(async () => {
      db = await setup();
      await db.ping();
    });

    afterAll(async () => {
      if (!db) return;
      for (const id of createdIds) await db.notes.delete(id);
      await db.close();
    });

    async function createNote(title = 'Contract test note', body = '') {
      const note = await db.notes.create({ title, body });
      createdIds.add(note.id);
      return note;
    }

    it('creates a note with a generated id and timestamps', async () => {
      const note = await createNote('Hello', 'World');

      expect(note).toMatchObject({ title: 'Hello', body: 'World' });
      expect(note.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(new Date(note.createdAt).toISOString()).toBe(note.createdAt);
      expect(note.updatedAt).toBe(note.createdAt);
    });

    it('finds a note by id', async () => {
      const note = await createNote();

      await expect(db.notes.findById(note.id)).resolves.toEqual(note);
    });

    it('returns null for an unknown id', async () => {
      await expect(db.notes.findById(UNKNOWN_ID)).resolves.toBeNull();
    });

    it('lists newest first', async () => {
      const first = await createNote('first');
      const second = await createNote('second');
      const third = await createNote('third');

      const ids = (await db.notes.list({ limit: 100 })).map((note) => note.id);
      const ours = ids.filter((id) =>
        [first.id, second.id, third.id].includes(id),
      );

      expect(ours).toEqual([third.id, second.id, first.id]);
    });

    it('paginates with limit and offset', async () => {
      await createNote();
      await createNote();

      const page = await db.notes.list({ limit: 2 });
      const second = await db.notes.list({ limit: 1, offset: 1 });

      expect(page).toHaveLength(2);
      expect(second).toEqual([page[1]]);
    });

    it('updates only the provided fields', async () => {
      const note = await createNote('Before', 'Unchanged');

      const updated = await db.notes.update(note.id, { title: 'After' });

      expect(updated).toMatchObject({
        id: note.id,
        title: 'After',
        body: 'Unchanged',
      });
      expect(updated!.updatedAt >= note.updatedAt).toBe(true);
      expect(updated!.createdAt).toBe(note.createdAt);
    });

    it('returns the note unchanged for an empty update', async () => {
      const note = await createNote();

      await expect(db.notes.update(note.id, {})).resolves.toEqual(note);
    });

    it('returns null when updating an unknown id', async () => {
      await expect(
        db.notes.update(UNKNOWN_ID, { title: 'x' }),
      ).resolves.toBeNull();
    });

    it('deletes a note', async () => {
      const note = await createNote();

      await expect(db.notes.delete(note.id)).resolves.toBe(true);
      await expect(db.notes.findById(note.id)).resolves.toBeNull();
    });

    it('returns false when deleting an unknown id', async () => {
      await expect(db.notes.delete(UNKNOWN_ID)).resolves.toBe(false);
    });
  });
}
