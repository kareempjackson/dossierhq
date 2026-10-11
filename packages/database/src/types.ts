import type {
  CreateNoteInput,
  Note,
  UpdateNoteInput,
} from '@dossierhq/contracts';
import type { DatabaseProvider } from './config.js';

/**
 * The ports. Application code depends only on these interfaces; each adapter
 * under `src/adapters/*` implements them for one database. Adding a database
 * means writing one more implementation, not touching the API or web app.
 */

export interface ListOptions {
  /** Defaults to {@link DEFAULT_LIST_LIMIT}. */
  limit?: number;
  offset?: number;
}

export const DEFAULT_LIST_LIMIT = 50;

export interface NotesRepository {
  /** Newest first. */
  list(options?: ListOptions): Promise<Note[]>;
  findById(id: string): Promise<Note | null>;
  create(input: CreateNoteInput): Promise<Note>;
  /** Resolves to `null` when no note has this id. An empty input returns the note unchanged. */
  update(id: string, input: UpdateNoteInput): Promise<Note | null>;
  /** Resolves to `false` when no note has this id. */
  delete(id: string): Promise<boolean>;
}

export interface DatabaseAdapter {
  readonly provider: DatabaseProvider;
  readonly notes: NotesRepository;
  /** Resolves when the database is reachable and migrated; rejects otherwise. */
  ping(): Promise<void>;
  /** Releases connections. The adapter must not be used afterwards. */
  close(): Promise<void>;
}
