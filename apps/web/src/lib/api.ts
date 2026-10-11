import 'server-only';
import {
  healthResponseSchema,
  listNotesResponseSchema,
  noteSchema,
  type CreateNoteInput,
} from '@dossierhq/contracts';
import { env } from './env';

/**
 * Typed client for the NestJS API. Server-only: pages and Server Actions call
 * it, the browser never does, and nothing here knows which database is in use.
 * Responses are parsed with the same schemas the API is built on.
 */
export const api = {
  async health() {
    // /health answers 503 with a body when the database is down, so read it either way.
    const res = await fetch(new URL('/health', env.API_URL), {
      signal: AbortSignal.timeout(5_000),
    });
    return healthResponseSchema.parse(await res.json());
  },

  notes: {
    async list() {
      return listNotesResponseSchema.parse(await request('/notes')).data;
    },

    async create(input: CreateNoteInput) {
      return noteSchema.parse(
        await request('/notes', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      );
    },

    async delete(id: string) {
      await request(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  },
};

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(new URL(path, env.API_URL), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `${init?.method ?? 'GET'} ${path} failed with ${res.status}`,
    );
  }
  return res.status === 204 ? undefined : res.json();
}
