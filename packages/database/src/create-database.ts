import { databaseConfigSchema, type DatabaseConfig } from './config.js';
import type { DatabaseAdapter } from './types.js';

/**
 * Creates the adapter selected by `config.provider`. Each adapter is imported
 * lazily, so only the driver you actually use gets loaded.
 *
 * To plug in another database: add its config schema in `config.ts`, write an
 * adapter under `adapters/<name>`, and add a case here. TypeScript flags this
 * switch until the new provider is handled.
 */
export async function createDatabase(
  config: DatabaseConfig,
): Promise<DatabaseAdapter> {
  const resolved = databaseConfigSchema.parse(config);

  switch (resolved.provider) {
    case 'supabase': {
      const { createSupabaseAdapter } =
        await import('./adapters/supabase/index.js');
      return createSupabaseAdapter(resolved);
    }
    case 'postgres': {
      const { createPostgresAdapter } =
        await import('./adapters/postgres/index.js');
      return createPostgresAdapter(resolved);
    }
    case 'memory': {
      const { createMemoryAdapter } =
        await import('./adapters/memory/index.js');
      if (resolved.seed === 'empty') return createMemoryAdapter();
      const { demo } = await import('@dossierhq/fixtures');
      return createMemoryAdapter(demo);
    }
  }
}
