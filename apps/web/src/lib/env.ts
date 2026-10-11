import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  API_URL: z.url().default('http://localhost:4000'),
});

export const env = envSchema.parse({
  API_URL: process.env.API_URL || undefined,
});
