import type {
  CreateNoteInput,
  Note,
  UpdateNoteInput,
} from '@dossierhq/contracts';
import type { Sql } from 'postgres';
import { DatabaseError } from '../../errors.js';
import {
  DEFAULT_LIST_LIMIT,
  type ListOptions,
  type NotesRepository,
} from '../../types.js';

type NoteRow = {
  id: string;
  title: string;
  body: string;
  created_at: Date;
  updated_at: Date;
};

export class PostgresNotesRepository implements NotesRepository {
  constructor(private readonly sql: Sql) {}

  list({ limit = DEFAULT_LIST_LIMIT, offset = 0 }: ListOptions = {}) {
    return this.query('list notes', async (sql) => {
      const rows = await sql<NoteRow[]>`
        select id, title, body, created_at, updated_at
        from notes
        order by created_at desc, id desc
        limit ${limit} offset ${offset}
      `;
      return rows.map(toNote);
    });
  }

  findById(id: string) {
    return this.query('find note', async (sql) => {
      const [row] = await sql<NoteRow[]>`
        select id, title, body, created_at, updated_at
        from notes
        where id = ${id}
      `;
      return row ? toNote(row) : null;
    });
  }

  create(input: CreateNoteInput) {
    return this.query('create note', async (sql) => {
      const [row] = await sql<NoteRow[]>`
        insert into notes (title, body)
        values (${input.title}, ${input.body})
        returning id, title, body, created_at, updated_at
      `;
      return toNote(row!);
    });
  }

  update(id: string, input: UpdateNoteInput) {
    const changes: { title?: string; body?: string } = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.body !== undefined) changes.body = input.body;
    if (Object.keys(changes).length === 0) return this.findById(id);

    return this.query('update note', async (sql) => {
      const [row] = await sql<NoteRow[]>`
        update notes set ${sql(changes)}
        where id = ${id}
        returning id, title, body, created_at, updated_at
      `;
      return row ? toNote(row) : null;
    });
  }

  delete(id: string) {
    return this.query('delete note', async (sql) => {
      const result = await sql`delete from notes where id = ${id}`;
      return result.count > 0;
    });
  }

  private async query<T>(
    action: string,
    run: (sql: Sql) => Promise<T>,
  ): Promise<T> {
    try {
      return await run(this.sql);
    } catch (error) {
      throw new DatabaseError(
        `Failed to ${action}: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
  }
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
