import { z } from 'zod';
import { toolSchema } from './sources.js';

export const connectorStatusSchema = z.enum(['healthy', 'syncing', 'failing']);
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>;

/** A read-only link to one of the MSP's tools. */
export const connectorSchema = z.object({
  id: z.string(),
  tool: toolSchema,
  /** What it covers, e.g. "RMM · 14 clients · 612 devices". */
  scope: z.string(),
  /** What Dossier may read, e.g. "read: devices, alerts, patch status". */
  access: z.string(),
  status: connectorStatusSchema,
  lastSyncAt: z.iso.datetime(),
  failure: z
    .object({
      since: z.iso.datetime(),
      /** What went wrong and what it affects, in plain language. */
      summary: z.string(),
      /** The fix, phrased as a button label. */
      fix: z.string(),
    })
    .nullable(),
});
export type Connector = z.infer<typeof connectorSchema>;

/** One read Dossier made from a tool. */
export const auditEntrySchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  tool: toolSchema,
  /** What was read, e.g. "Device inventory". */
  read: z.string(),
  clientId: z.string().nullable(),
  recordCount: z.number().int().nonnegative(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
