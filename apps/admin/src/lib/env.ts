import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  API_URL: z.url().default('http://localhost:4000'),
  /**
   * The API's ADMIN_API_KEY, sent with every request; /admin is 404 without
   * it. Checked when a request is made, so a build doesn't need it.
   */
  ADMIN_API_KEY: z.string().min(32).optional(),
  /** The API's CLIENT_IP_KEY, so it learns staff's addresses. */
  CLIENT_IP_KEY: z.string().min(32).optional(),
});

export const env = envSchema.parse({
  API_URL: process.env.API_URL || undefined,
  ADMIN_API_KEY: process.env.ADMIN_API_KEY?.trim() || undefined,
  CLIENT_IP_KEY: process.env.CLIENT_IP_KEY?.trim() || undefined,
});
