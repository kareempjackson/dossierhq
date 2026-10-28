import { DEFAULT_MODEL, modelIdSchema } from '@dossierhq/contracts';
import {
  databaseConfigFromEnv,
  type DatabaseConfig,
} from '@dossierhq/database';
import { z } from 'zod';
import { MAIL_PROVIDERS, type MailConfig } from '../mail/mailer.js';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  /** How long a sign-in lasts. */
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /**
   * Pins the clock the API reports to the web app. For tests against the
   * fixtures; leave unset everywhere else. Sessions and syncs ignore it.
   */
  CLOCK_FIXED_AT: z.iso.datetime().optional(),
  /**
   * 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts the
   * credentials of connected tools. Changing it means reconnecting them.
   */
  CONNECTOR_SECRET_KEY: z
    .string()
    .optional()
    .transform((value, context) => {
      if (!value) return undefined;
      const key = Buffer.from(value, 'base64');
      if (key.length !== 32) {
        context.addIssue({
          code: 'custom',
          message: 'Must be 32 bytes, base64. Run `openssl rand -base64 32`.',
        });
        return z.NEVER;
      }
      return key;
    }),
  /**
   * Lets Dossier draft recommendations, reports and answers with Claude.
   * Leave unset and drafting stays off; everything else still works.
   */
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  /**
   * The Claude model to draft with when a workspace hasn't chosen one. Must
   * be one of INTELLIGENCE_MODELS in packages/contracts/src/models.ts.
   */
  INTELLIGENCE_MODEL: modelIdSchema.default(DEFAULT_MODEL),
  /** How often connected tools sync. 0 turns scheduled syncs off. */
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(15),
  /**
   * Point a tool at another address, e.g. a fake server in tests. Leave unset
   * to use the tools' real APIs.
   */
  NINJAONE_API_URL: z.url().optional(),
  FATHOM_API_URL: z.url().optional(),
  MICROSOFT_LOGIN_URL: z.url().optional(),
  MICROSOFT_GRAPH_URL: z.url().optional(),
  /** Where people open Dossier, for the links in emails. */
  WEB_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  /**
   * How Dossier sends email: password resets, invites and reports. `log`
   * writes each one to the API's log instead, for development.
   */
  MAIL_PROVIDER: z.enum(MAIL_PROVIDERS).default('log'),
  /** The sender, e.g. `Dossier <reports@yourmsp.com>`. Required for Postmark. */
  MAIL_FROM: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  POSTMARK_SERVER_TOKEN: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  /** For tests; leave unset to use Postmark's API. */
  POSTMARK_API_URL: z.url().optional(),
});

export type AppConfig = z.infer<typeof envSchema> & {
  database: DatabaseConfig;
  mail: MailConfig;
};

function mailConfig(env: z.infer<typeof envSchema>): MailConfig | string {
  if (env.MAIL_PROVIDER === 'log') {
    return {
      provider: 'log',
      from: env.MAIL_FROM ?? 'Dossier <dossier@localhost>',
    };
  }
  const missing = [
    !env.MAIL_FROM && 'MAIL_FROM',
    !env.POSTMARK_SERVER_TOKEN && 'POSTMARK_SERVER_TOKEN',
  ].filter(Boolean);
  if (missing.length > 0) {
    return `MAIL_PROVIDER=postmark needs ${missing.join(' and ')}`;
  }
  return {
    provider: 'postmark',
    from: env.MAIL_FROM!,
    token: env.POSTMARK_SERVER_TOKEN!,
    baseUrl: env.POSTMARK_API_URL,
  };
}

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
  const mail = mailConfig(parsed.data);
  if (typeof mail === 'string') {
    throw new Error(`Invalid API environment:\n✖ ${mail}`);
  }
  return {
    ...parsed.data,
    database: databaseConfigFromEnv(env as Record<string, string | undefined>),
    mail,
  };
}
