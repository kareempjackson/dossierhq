import { randomUUID } from 'node:crypto';
import type {
  CreateNoteInput,
  Note,
  UpdateNoteInput,
} from '@dossierhq/contracts';
import {
  DEFAULT_LIST_LIMIT,
  type DatabaseAdapter,
  type ListOptions,
  type NotesRepository,
} from '../../types.js';

/**
 * Keeps everything in process memory. Handy for unit/e2e tests and for running
 * the API with no database at all. Data is lost on restart.
 */
export function createMemoryAdapter(): DatabaseAdapter {
  return {
    provider: 'memory',
    notes: new MemoryNotesRepository(),
    ping: async () => {},
    close: async () => {},
  };
}

type StoredNote = Note & { seq: number };

class MemoryNotesRepository implements NotesRepository {
  private readonly notes = new Map<string, StoredNote>();
  // Breaks createdAt ties so "newest first" stays stable within a millisecond.
  private seq = 0;

  async list({ limit = DEFAULT_LIST_LIMIT, offset = 0 }: ListOptions = {}) {
    return [...this.notes.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq)
      .slice(offset, offset + limit)
      .map(toNote);
  }

  async findById(id: string) {
    const note = this.notes.get(id);
    return note ? toNote(note) : null;
  }

  async create(input: CreateNoteInput) {
    const now = new Date().toISOString();
    const note: StoredNote = {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      createdAt: now,
      updatedAt: now,
      seq: this.seq++,
    };
    this.notes.set(note.id, note);
    return toNote(note);
  }

  async update(id: string, input: UpdateNoteInput) {
    const existing = this.notes.get(id);
    if (!existing) return null;
    if (input.title === undefined && input.body === undefined)
      return toNote(existing);

    const updated: StoredNote = {
      ...existing,
      title: input.title ?? existing.title,
      body: input.body ?? existing.body,
      updatedAt: new Date().toISOString(),
    };
    this.notes.set(id, updated);
    return toNote(updated);
  }

  async delete(id: string) {
    return this.notes.delete(id);
  }
}

function toNote({ seq: _seq, ...note }: StoredNote): Note {
  return note;
}
