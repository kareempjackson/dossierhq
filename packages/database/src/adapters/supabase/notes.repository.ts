import type {
  CreateNoteInput,
  Note,
  UpdateNoteInput,
} from '@dossierhq/contracts';
import { DatabaseError } from '../../errors.js';
import {
  DEFAULT_LIST_LIMIT,
  type ListOptions,
  type NotesRepository,
} from '../../types.js';
import type { Tables, TablesUpdate } from './database.types.js';
import type { SupabaseDatabaseClient } from './index.js';

const COLUMNS = 'id, title, body, created_at, updated_at';

type NoteRow = Pick<
  Tables<'notes'>,
  'id' | 'title' | 'body' | 'created_at' | 'updated_at'
>;

export class SupabaseNotesRepository implements NotesRepository {
  constructor(private readonly client: SupabaseDatabaseClient) {}

  async list({ limit = DEFAULT_LIST_LIMIT, offset = 0 }: ListOptions = {}) {
    const { data, error } = await this.client
      .from('notes')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw failed('list notes', error);
    return data.map(toNote);
  }

  async findById(id: string) {
    const { data, error } = await this.client
      .from('notes')
      .select(COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw failed('find note', error);
    return data ? toNote(data) : null;
  }

  async create(input: CreateNoteInput) {
    const { data, error } = await this.client
      .from('notes')
      .insert({ title: input.title, body: input.body })
      .select(COLUMNS)
      .single();
    if (error) throw failed('create note', error);
    return toNote(data);
  }

  async update(id: string, input: UpdateNoteInput) {
    const changes: TablesUpdate<'notes'> = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.body !== undefined) changes.body = input.body;
    if (Object.keys(changes).length === 0) return this.findById(id);

    const { data, error } = await this.client
      .from('notes')
      .update(changes)
      .eq('id', id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw failed('update note', error);
    return data ? toNote(data) : null;
  }

  async delete(id: string) {
    const { count, error } = await this.client
      .from('notes')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw failed('delete note', error);
    return (count ?? 0) > 0;
  }
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function failed(action: string, error: { message: string }) {
  return new DatabaseError(`Failed to ${action}: ${error.message}`, {
    cause: error,
  });
}
