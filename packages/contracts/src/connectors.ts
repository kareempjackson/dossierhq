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

/**
 * - `read`: something Dossier read from a connected tool.
 * - `sign-in`: signing in or out, failed attempts, password resets.
 * - `change`: something a person changed in Dossier, e.g. approving a report.
 */
export const auditKindSchema = z.enum(['read', 'sign-in', 'change']);
export type AuditKind = z.infer<typeof auditKindSchema>;

export const auditOutcomeSchema = z.enum(['ok', 'failed']);
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;

/**
 * Who did it, as they were then: the name and email stay if the person is
 * later removed (their ID becomes null).
 */
export const auditActorSchema = z.object({
  userId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
});
export type AuditActor = z.infer<typeof auditActorSchema>;

/** One thing that happened: a read from a tool, a sign-in, or a change. */
export const auditEntrySchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  kind: auditKindSchema,
  /** The tool read from, or the one a change was about. */
  tool: toolSchema.nullable(),
  /** What happened, e.g. "Device inventory" or "Approved the weekly report". */
  what: z.string(),
  clientId: z.string().nullable(),
  /** Records read; 0 for sign-ins and changes. */
  recordCount: z.number().int().nonnegative(),
  /** Failed: a wrong password, a refused read, credentials that didn't work. */
  outcome: auditOutcomeSchema,
  /** Null when Dossier did it itself, e.g. a scheduled sync. */
  actor: auditActorSchema.nullable(),
  /** Where a sign-in came from, when the web app passed it on. */
  ip: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/**
 * How many entries the audit log holds: reads per tool, then sign-ins and
 * changes (`tool` null), always in that order and including zeros.
 */
export const auditCountSchema = z.object({
  kind: auditKindSchema,
  tool: toolSchema.nullable(),
  count: z.number().int().nonnegative(),
});
export type AuditCount = z.infer<typeof auditCountSchema>;

/** The groups auditCountSchema counts, in order. */
export const AUDIT_COUNT_GROUPS: Pick<AuditCount, 'kind' | 'tool'>[] = [
  ...toolSchema.options.map((tool) => ({ kind: 'read' as const, tool })),
  { kind: 'sign-in', tool: null },
  { kind: 'change', tool: null },
];

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
  z
    .object({
      tool: z.literal('ninjaone'),
      region: ninjaOneRegionSchema,
      clientId: secret('client ID'),
      /** Absent for an app NinjaOne gives no secret, which must sign in. */
      clientSecret: secret('client secret').optional(),
      /**
       * From signing in with NinjaOne. Tickets need it: NinjaOne only lists them
       * for a signed-in technician. Without it, Dossier signs in as the app and
       * reads devices and alerts only.
       */
      refreshToken: z.string().min(1).max(4000).optional(),
    })
    .refine((c) => c.clientSecret !== undefined || c.refreshToken, {
      message: 'Enter the client secret',
      path: ['clientSecret'],
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

/**
 * What testing a connection found, without saving or syncing anything: the
 * account the tool let Dossier into, or its problem in plain words.
 */
export const connectionTestSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), account: z.string() }),
  z.object({ ok: z.literal(false), problem: z.string() }),
]);
export type ConnectionTest = z.infer<typeof connectionTestSchema>;

// Signing in with NinjaOne ------------------------------------------------------

/** Starts "Sign in with NinjaOne": the app's details, and where to come back to. */
export const ninjaOneSignInSchema = z.object({
  region: ninjaOneRegionSchema,
  clientId: secret('client ID'),
  /**
   * Some NinjaOne apps come with no secret. Those sign in with PKCE instead:
   * a one-time code Dossier makes for each sign-in.
   */
  clientSecret: secret('client secret').optional(),
  /** Dossier's callback, which must be a redirect URI on the NinjaOne app. */
  redirectUri: z.url({ protocol: /^https?$/ }),
});
export type NinjaOneSignIn = z.infer<typeof ninjaOneSignInSchema>;

export const ninjaOneSignInStartSchema = z.object({
  /** NinjaOne's sign-in page, to send the person to. */
  authorizeUrl: z.url(),
  /** Sealed by the API; handed back unchanged when NinjaOne sends them back. */
  pending: z.string(),
});
export type NinjaOneSignInStart = z.infer<typeof ninjaOneSignInStartSchema>;

/** What NinjaOne's redirect carried, plus the sealed details from the start. */
export const ninjaOneSignInFinishSchema = z.object({
  pending: z.string().min(1).max(8000),
  state: z.string().min(1).max(200),
  code: z.string().min(1).max(4000),
});
export type NinjaOneSignInFinish = z.infer<typeof ninjaOneSignInFinishSchema>;
