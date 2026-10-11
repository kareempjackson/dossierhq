import {
  databaseConfigFromEnv,
  type DatabaseConfig,
} from '@dossierhq/database';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export type AppConfig = z.infer<typeof envSchema> & {
  database: DatabaseConfig;
};

/**
 * Handed to ConfigModule: validates the environment once at boot so a bad or
 * missing variable stops the API with a readable message.
 */
export function validateConfig(env: Record<string, unknown>): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid API environment:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return {
    ...parsed.data,
    database: databaseConfigFromEnv(env as Record<string, string | undefined>),
  };
}
