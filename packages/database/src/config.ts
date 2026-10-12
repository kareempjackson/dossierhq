import { z } from 'zod';
import { DatabaseConfigError } from './errors.js';

export const DATABASE_PROVIDERS = ['supabase', 'postgres', 'memory'] as const;
export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

export const supabaseConfigSchema = z.object({
  provider: z.literal('supabase'),
  url: z.url(),
  /** A secret (`sb_secret_…`) or legacy `service_role` key. Server-side only. */
  secretKey: z.string().min(1),
});

export const postgresConfigSchema = z.object({
  provider: z.literal('postgres'),
  url: z.url(),
  /** Pool size. Default 10. */
  maxConnections: z.number().int().positive().optional(),
  /** Default true. Turn off behind a transaction-mode pooler such as Supabase's port 6543. */
  preparedStatements: z.boolean().optional(),
});

export const memoryConfigSchema = z.object({
  provider: z.literal('memory'),
  /** Start with the Larkspur IT demo workspace (default) or nothing at all. */
  seed: z.enum(['demo', 'empty']).optional(),
});

export const databaseConfigSchema = z.discriminatedUnion('provider', [
  supabaseConfigSchema,
  postgresConfigSchema,
  memoryConfigSchema,
]);

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type SupabaseConfig = Omit<
  z.infer<typeof supabaseConfigSchema>,
  'provider'
>;
export type PostgresConfig = Omit<
  z.infer<typeof postgresConfigSchema>,
  'provider'
>;

type Env = Record<string, string | undefined>;

/** Maps each provider's environment variables onto its config. */
const envSchemas = {
  supabase: z
    .object({
      SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
    })
    .transform((env): DatabaseConfig => ({
      provider: 'supabase',
      url: env.SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    })),
  postgres: z
    .object({
      DATABASE_URL: z.url(),
      DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
      DATABASE_PREPARED_STATEMENTS: z.stringbool().optional(),
    })
    .transform((env): DatabaseConfig => ({
      provider: 'postgres',
      url: env.DATABASE_URL,
      maxConnections: env.DATABASE_POOL_MAX,
      preparedStatements: env.DATABASE_PREPARED_STATEMENTS,
    })),
  memory: z
    .object({ DATABASE_SEED: z.enum(['demo', 'empty']).optional() })
    .transform((env): DatabaseConfig => ({
      provider: 'memory',
      seed: env.DATABASE_SEED,
    })),
} satisfies Record<DatabaseProvider, z.ZodType<DatabaseConfig>>;

/**
 * Builds a database config from environment variables. `DATABASE_PROVIDER`
 * picks the adapter (default `supabase`); the remaining variables depend on it.
 * Throws a {@link DatabaseConfigError} naming the missing or invalid variables.
 */
export function databaseConfigFromEnv(env: Env): DatabaseConfig {
  const provider = z
    .enum(DATABASE_PROVIDERS)
    .safeParse(env.DATABASE_PROVIDER?.trim() || 'supabase');
  if (!provider.success) {
    throw new DatabaseConfigError(
      `DATABASE_PROVIDER must be one of: ${DATABASE_PROVIDERS.join(', ')} (got "${env.DATABASE_PROVIDER}")`,
    );
  }

  const parsed = envSchemas[provider.data].safeParse(env);
  if (!parsed.success) {
    throw new DatabaseConfigError(
      `Invalid environment for DATABASE_PROVIDER=${provider.data}:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
