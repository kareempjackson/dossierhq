import type {
  CreateNoteInput,
  ListNotesQuery,
  Note,
  UpdateNoteInput,
} from '@dossierhq/contracts';
import type { NotesRepository } from '@dossierhq/database';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NOTES_REPOSITORY } from '../database/database.tokens.js';

@Injectable()
export class NotesService {
  constructor(
    @Inject(NOTES_REPOSITORY) private readonly notes: NotesRepository,
  ) {}

  list(query: ListNotesQuery): Promise<Note[]> {
    return this.notes.list(query);
  }

  async get(id: string): Promise<Note> {
    return (await this.notes.findById(id)) ?? notFound(id);
  }

  create(input: CreateNoteInput): Promise<Note> {
    return this.notes.create(input);
  }

  async update(id: string, input: UpdateNoteInput): Promise<Note> {
    return (await this.notes.update(id, input)) ?? notFound(id);
  }

  async remove(id: string): Promise<void> {
    if (!(await this.notes.delete(id))) notFound(id);
  }
}

function notFound(id: string): never {
  throw new NotFoundException(`Note ${id} not found`);
}
