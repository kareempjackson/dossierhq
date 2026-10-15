import { z } from 'zod';
import { toolSchema, type Tool } from './sources.js';

export const connectorStatusSchema = z.enum(['healthy', 'syncing', 'failing']);
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>;

/** A read-only link to one of the MSP's tools. */
export const connectorSchema = z.object({
  id: z.string(),
  tool: toolSchema,
  /** Which account it reads, e.g. "eu.ninjarmm.com" or "acme.huducloud.com". */
  account: z.string(),
  /** What it covers, e.g. "RMM · 14 clients · 612 devices". */
  scope: z.string(),
  /** What Dossier may read, e.g. "read: devices, alerts, patch status". */
  access: z.string(),
  status: connectorStatusSchema,
  /** The last sync that finished without errors; null before the first. */
  lastSyncAt: z.iso.datetime().nullable(),
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

// Connecting a tool -----------------------------------------------------------

/** NinjaOne hosts each customer in one region; the sign-in URL shows which. */
export const NINJAONE_REGIONS = {
  app: { label: 'United States (app.ninjarmm.com)', host: 'app.ninjarmm.com' },
  us2: {
    label: 'United States 2 (us2.ninjarmm.com)',
    host: 'us2.ninjarmm.com',
  },
  ca: { label: 'Canada (ca.ninjarmm.com)', host: 'ca.ninjarmm.com' },
  eu: { label: 'Europe (eu.ninjarmm.com)', host: 'eu.ninjarmm.com' },
  oc: { label: 'Oceania (oc.ninjarmm.com)', host: 'oc.ninjarmm.com' },
  jp: { label: 'Japan (jp.ninjarmm.com)', host: 'jp.ninjarmm.com' },
  fed: { label: 'FedRAMP (fed.ninjarmm.com)', host: 'fed.ninjarmm.com' },
} as const;
export const ninjaOneRegionSchema = z.enum([
  'app',
  'us2',
  'ca',
  'eu',
  'oc',
  'jp',
  'fed',
]);
export type NinjaOneRegion = z.infer<typeof ninjaOneRegionSchema>;

const secret = (what: string) =>
  z.string().trim().min(1, `Enter the ${what}`).max(500);

const httpsUrl = (what: string) =>
  z
    .url({
      protocol: /^https?$/,
      error: `Enter the ${what}, starting https://`,
    })
    .transform((value) => value.replace(/\/+$/, ''));

/**
 * What each tool needs to connect. Secrets are encrypted before they are
 * stored and never sent back.
 */
export const connectorCredentialsSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('ninjaone'),
    region: ninjaOneRegionSchema,
    clientId: secret('client ID'),
    clientSecret: secret('client secret'),
  }),
  z.object({
    tool: z.literal('hudu'),
    /** The Hudu address, e.g. `https://acme.huducloud.com`. */
    url: httpsUrl('Hudu address'),
    apiKey: secret('API key'),
  }),
  z.object({
    tool: z.literal('sharepoint'),
    tenantId: secret('tenant ID'),
    clientId: secret('client ID'),
    clientSecret: secret('client secret'),
    /** e.g. `https://acme.sharepoint.com/sites/Clients`. */
    siteUrl: httpsUrl('site address'),
    /** Document library; the site's first library when empty. */
    library: z.string().trim().max(200).default(''),
    /** Folder in the library that holds one folder per client; empty for the top. */
    folder: z
      .string()
      .trim()
      .max(400)
      .transform((value) => value.replace(/^\/+|\/+$/g, ''))
      .default(''),
  }),
  z.object({
    tool: z.literal('fathom'),
    apiKey: secret('API key'),
  }),
]);
export type ConnectorCredentials = z.infer<typeof connectorCredentialsSchema>;
export type CredentialsFor<T extends Tool> = Extract<
  ConnectorCredentials,
  { tool: T }
>;
