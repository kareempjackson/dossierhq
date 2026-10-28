import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  API_URL: z.url().default('http://localhost:4000'),
  /**
   * The API's CLIENT_IP_KEY. With it, requests to the API carry the
   * visitor's address, for per-address limits and the audit log.
   */
  CLIENT_IP_KEY: z.string().min(32).optional(),
});

export const env = envSchema.parse({
  API_URL: process.env.API_URL || undefined,
  CLIENT_IP_KEY: process.env.CLIENT_IP_KEY?.trim() || undefined,
});
