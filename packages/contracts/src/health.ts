import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.object({
    provider: z.string(),
    status: z.enum(['up', 'down']),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
