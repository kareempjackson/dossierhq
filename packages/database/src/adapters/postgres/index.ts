import postgres from 'postgres';
import type { PostgresConfig } from '../../config.js';
import { DatabaseError } from '../../errors.js';
import type { DatabaseAdapter } from '../../types.js';
import { PostgresNotesRepository } from './notes.repository.js';

/**
 * Plain SQL over a Postgres connection string. Works with Supabase (direct or
 * pooled connection), Neon, RDS, Cloud SQL, or a local Postgres, using the
 * same schema as `supabase/migrations`.
 */
export function createPostgresAdapter(config: PostgresConfig): DatabaseAdapter {
  const sql = postgres(config.url, {
    max: config.maxConnections ?? 10,
    prepare: config.preparedStatements ?? true,
    onnotice: () => {},
  });

  return {
    provider: 'postgres',
    notes: new PostgresNotesRepository(sql),
    async ping() {
      try {
        await sql`select 1 from notes limit 1`;
      } catch (error) {
        throw new DatabaseError(
          `Postgres ping failed: ${(error as Error).message}`,
          {
            cause: error,
          },
        );
      }
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
