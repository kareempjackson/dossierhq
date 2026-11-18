import { z } from 'zod';
import { emailSchema } from './auth.js';

/**
 * `POST /product-updates`: someone on the public site asking for news about
 * Dossier. Public, and answered the same whether they were on the list.
 */
export const productUpdatesSignupSchema = z.object({
  email: emailSchema,
  /** The page they signed up on, e.g. `/welcome`. */
  source: z
    .string()
    .regex(/^\/[\w/-]{0,199}$/, 'That isn’t a page on this site')
    .optional(),
});
export type ProductUpdatesSignup = z.infer<typeof productUpdatesSignupSchema>;
