import { z } from 'zod';
import type { IntelligenceRecord } from './intelligence.js';

/**
 * What Dossier's memory keeps: what's written in the tools, cut into
 * passages it can search by words and by meaning.
 */
export const MEMORY_KINDS = [
  'ticket',
  'summary',
  'transcript',
  'note',
  'alert',
  'asset',
] as const;
export const memoryKindSchema = z.enum(MEMORY_KINDS);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const MEMORY_KIND_NAMES: Record<MemoryKind, string> = {
  ticket: 'Ticket conversations',
  summary: 'Meeting summaries',
  transcript: 'Meeting transcripts',
  note: 'Meeting notes',
  alert: 'Device alerts',
  asset: 'Documentation',
};

/** The switch on the Intelligence page that shares each kind with models. */
export const MEMORY_RECORD_OF: Record<MemoryKind, IntelligenceRecord> = {
  ticket: 'tickets',
  summary: 'meetings',
  transcript: 'meetings',
  note: 'notes',
  alert: 'devices',
  asset: 'documentation',
};

/** `GET /intelligence/memory`: what Dossier remembers, and how far along. */
export const memoryStatusSchema = z.object({
  /**
   * Whether passages are embedded to be found by meaning: on; off on the
   * Intelligence page; or unavailable without Dossier's Voyage AI key.
   */
  embeddings: z.enum(['on', 'off', 'unavailable']),
  /** The embedding model in use. */
  model: z.string(),
  documents: z.partialRecord(memoryKindSchema, z.number().int().nonnegative()),
  chunks: z.number().int().nonnegative(),
  embedded: z.number().int().nonnegative(),
  /** The oldest thing remembered; null when nothing is. */
  oldestAt: z.iso.datetime().nullable(),
  /** A read of past records is under way. */
  backfilling: z.boolean(),
});
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
