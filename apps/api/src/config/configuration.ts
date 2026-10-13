import {
  databaseConfigFromEnv,
  type DatabaseConfig,
} from '@dossierhq/database';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  /** How long a sign-in lasts. */
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /**
   * Pins the API's clock, so seeded demo data stays "current". Leave unset to
   * use real time.
   */
  CLOCK_FIXED_AT: z.iso.datetime().optional(),
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
