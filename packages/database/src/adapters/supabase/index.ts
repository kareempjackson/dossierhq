import { createClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from '../../config.js';
import { DatabaseError } from '../../errors.js';
import type { DatabaseAdapter } from '../../types.js';
import type { Database } from './database.types.js';
import { SupabaseNotesRepository } from './notes.repository.js';

export type SupabaseDatabaseClient = ReturnType<typeof createClient<Database>>;

/**
 * Talks to Supabase through its Data API (PostgREST) with a server-side secret
 * key, which bypasses Row Level Security. Never use this adapter in the browser.
 */
export function createSupabaseAdapter(config: SupabaseConfig): DatabaseAdapter {
  const client = createClient<Database>(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return {
    provider: 'supabase',
    notes: new SupabaseNotesRepository(client),
    async ping() {
      const { error } = await client
        .from('notes')
        .select('id', { head: true })
        .limit(1);
      if (error)
        throw new DatabaseError(`Supabase ping failed: ${error.message}`, {
          cause: error,
        });
    },
    async close() {
      await client.removeAllChannels();
    },
  };
}
