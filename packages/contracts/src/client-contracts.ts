import { z } from 'zod';

/**
 * A client's contract as someone enters it. No tool records contracts, so
 * these are typed in, and syncs leave them alone.
 */
export const contractUpdateSchema = z
  .object({
    plan: z
      .string()
      .trim()
      .min(1, 'Name the plan')
      .max(100, 'Keep the plan’s name under 100 characters'),
    startedOn: z.iso.date('Enter the day it started'),
    renewsOn: z.iso.date('Enter the day it renews'),
    monthlyFee: z
      .number('Enter the monthly fee')
      .nonnegative('The fee can’t be negative')
      .max(10_000_000, 'That fee is too large')
      .transform((fee) => Math.round(fee * 100) / 100),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, like GBP'),
    includes: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(200, 'Keep each item under 200 characters'),
      )
      .max(30, 'List at most 30 things it includes')
      .default([]),
  })
  .refine((contract) => contract.renewsOn >= contract.startedOn, {
    message: 'It can’t renew before it starts',
    path: ['renewsOn'],
  });
export type ContractUpdate = z.input<typeof contractUpdateSchema>;

/** The signed contract and the like, kept with the client. */
export const CONTRACT_DOCUMENT_TYPES = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'Word',
  'application/msword': 'Word',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
} as const;
export type ContractDocumentType = keyof typeof CONTRACT_DOCUMENT_TYPES;
export const contractDocumentTypeSchema = z.enum(
  Object.keys(CONTRACT_DOCUMENT_TYPES) as [
    ContractDocumentType,
    ...ContractDocumentType[],
  ],
);

export const CONTRACT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CONTRACT_DOCUMENTS_MAX = 20;

/** A file kept with a client's contract, without its content. */
export const contractDocumentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  contentType: contractDocumentTypeSchema,
  /** In bytes. */
  size: z.number().int().positive(),
  uploadedAt: z.iso.datetime(),
  /** Kept as they were, so the file still says who added it. */
  uploadedBy: z.object({ userId: z.string().nullable(), name: z.string() }),
});
export type ContractDocument = z.infer<typeof contractDocumentSchema>;
