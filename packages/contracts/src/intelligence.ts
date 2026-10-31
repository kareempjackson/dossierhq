import { z } from 'zod';
import { modelIdSchema, modelUsageSchema, providerIdSchema } from './models.js';

/** What Dossier asked a model to do. */
export const intelligenceKindSchema = z.enum([
  'recommendations',
  'ask',
  'meetings',
  'reports',
  'patterns',
]);
export type IntelligenceKind = z.infer<typeof intelligenceKindSchema>;

/** One kind of work over a period: how often it ran and what it cost. */
export const intelligenceSpendSchema = modelUsageSchema.extend({
  kind: intelligenceKindSchema,
  runs: z.number().int().nonnegative(),
  /** US dollars, at the prices of the model each run used. */
  cost: z.number().nonnegative(),
});
export type IntelligenceSpend = z.infer<typeof intelligenceSpendSchema>;

// What the workspace wants ---------------------------------------------------

/** Things Dossier can produce with Claude, each of which a workspace can turn off. */
export const intelligenceOutputSchema = z.enum([
  'recommendations',
  'reportQuestions',
  'meetingNotes',
  'ask',
  'patterns',
]);
export type IntelligenceOutput = z.infer<typeof intelligenceOutputSchema>;

export const INTELLIGENCE_OUTPUTS: {
  id: IntelligenceOutput;
  name: string;
  description: string;
  /** False until Dossier can do it; its switch shows as coming soon. */
  available: boolean;
}[] = [
  {
    id: 'recommendations',
    name: 'Recommendations',
    description:
      'Suggested next steps for each client, drafted after syncs for your team to accept or dismiss.',
    available: true,
  },
  {
    id: 'reportQuestions',
    name: 'Report questions',
    description: 'Answers to the questions you save, in each weekly report.',
    available: true,
  },
  {
    id: 'meetingNotes',
    name: 'Meeting notes',
    description:
      'What clients said they’re planning, worried about and asking for, from recorded meetings and the notes you add.',
    available: true,
  },
  {
    id: 'ask',
    name: 'Ask Dossier',
    description:
      'Answers to questions typed into the Ask box, from every client’s records, citing what they rest on.',
    available: true,
  },
  {
    id: 'patterns',
    name: 'Patterns across clients',
    description:
      'The same problem at several clients, or risks building up across them, looked for after syncs and shown on Home.',
    available: true,
  },
];

/** The kind of work each output is, as runs are logged. */
export const OUTPUT_OF_KIND: Record<IntelligenceKind, IntelligenceOutput> = {
  recommendations: 'recommendations',
  reports: 'reportQuestions',
  meetings: 'meetingNotes',
  ask: 'ask',
  patterns: 'patterns',
};

/** What Claude looks for when it suggests what to do. */
export const intelligenceTopicSchema = z.enum([
  'backups',
  'patching',
  'security',
  'devices',
  'renewals',
  'promises',
  'helpdesk',
  'plans',
]);
export type IntelligenceTopic = z.infer<typeof intelligenceTopicSchema>;

export const INTELLIGENCE_TOPICS: {
  id: IntelligenceTopic;
  name: string;
  /** What it covers, as the model is told. */
  description: string;
}[] = [
  {
    id: 'backups',
    name: 'Backups and restores',
    description: 'failed or missing backups, and restore tests',
  },
  {
    id: 'patching',
    name: 'Patching and updates',
    description: 'failed or pending patches, and unsupported operating systems',
  },
  {
    id: 'security',
    name: 'Security and access',
    description: 'MFA, accounts, permissions, firewalls and security alerts',
  },
  {
    id: 'devices',
    name: 'Device health',
    description: 'offline or stale devices, failing hardware, and old machines',
  },
  {
    id: 'renewals',
    name: 'Expiry dates and renewals',
    description:
      'domains, certificates, warranties, licences and contract renewals',
  },
  {
    id: 'promises',
    name: 'Promises to the client',
    description: 'what the MSP said it would do, and whether it is late',
  },
  {
    id: 'helpdesk',
    name: 'Helpdesk',
    description: 'urgent, stuck or recurring tickets',
  },
  {
    id: 'plans',
    name: 'Client plans and concerns',
    description:
      'what the client is planning, worried about or asked for in meetings',
  },
];

/** Kinds of synced record, each of which a workspace can keep from Claude. */
export const intelligenceRecordSchema = z.enum([
  'devices',
  'tickets',
  'meetings',
  'documentation',
  'files',
  'notes',
]);
export type IntelligenceRecord = z.infer<typeof intelligenceRecordSchema>;

export const INTELLIGENCE_RECORDS: {
  id: IntelligenceRecord;
  name: string;
  /** Where they come from, e.g. "NinjaOne". */
  from: string;
  description: string;
}[] = [
  {
    id: 'devices',
    name: 'Devices and alerts',
    from: 'NinjaOne',
    description: 'Device names, users, operating systems, patching and alerts.',
  },
  {
    id: 'tickets',
    name: 'Tickets',
    from: 'NinjaOne',
    description: 'Subjects, status, priority, requesters and technicians.',
  },
  {
    id: 'meetings',
    name: 'Meetings',
    from: 'Fathom',
    description:
      'Titles, attendees, Fathom’s summaries and action items, and the promises made in them.',
  },
  {
    id: 'documentation',
    name: 'Documentation',
    from: 'Hudu',
    description:
      'Assets, websites and expiry dates. Passwords are never read into Dossier.',
  },
  {
    id: 'files',
    name: 'File names',
    from: 'SharePoint',
    description: 'Names, folders and who changed them. Never file contents.',
  },
  {
    id: 'notes',
    name: 'Meeting notes',
    from: 'Dossier',
    description: 'Notes your team pastes in or forwards by email.',
  },
];

const on = z.boolean().default(true);

/** What a workspace wants from Claude. Anything left unsaid is on. */
export const intelligencePreferencesSchema = z.object({
  outputs: z
    .object({
      recommendations: on,
      reportQuestions: on,
      meetingNotes: on,
      ask: on,
      patterns: on,
    } satisfies Record<IntelligenceOutput, unknown>)
    .prefault({}),
  topics: z
    .object({
      backups: on,
      patching: on,
      security: on,
      devices: on,
      renewals: on,
      promises: on,
      helpdesk: on,
      plans: on,
    } satisfies Record<IntelligenceTopic, unknown>)
    .prefault({}),
  records: z
    .object({
      devices: on,
      tickets: on,
      meetings: on,
      documentation: on,
      files: on,
      notes: on,
    } satisfies Record<IntelligenceRecord, unknown>)
    .prefault({}),
});
export type IntelligencePreferences = z.output<
  typeof intelligencePreferencesSchema
>;

// API keys --------------------------------------------------------------------

/** A key the workspace brought, as anyone may see it: never the key itself. */
export const intelligenceKeySchema = z.object({
  provider: providerIdSchema,
  /** The key's last four characters, to tell keys apart. */
  hint: z.string(),
  /** The name of whoever added it. */
  addedBy: z.string(),
  addedAt: z.iso.datetime(),
});
export type IntelligenceKey = z.infer<typeof intelligenceKeySchema>;

/** PUT /intelligence/keys/:provider. Checked with the provider before it's kept. */
export const intelligenceKeyUpdateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(20, 'That’s too short to be an API key.')
    .max(400, 'That’s too long to be an API key.')
    .regex(/^\S+$/, 'An API key has no spaces in it.'),
});
export type IntelligenceKeyUpdate = z.infer<typeof intelligenceKeyUpdateSchema>;

/** GET /intelligence: which model drafts for this workspace, and its spend. */
export const intelligenceSettingsSchema = z.object({
  /** False while the model in use has no key to run on. */
  enabled: z.boolean(),
  /** Why nothing drafts, when `enabled` is false. */
  off: z.string().nullable(),
  /** The model runs use now. */
  model: modelIdSchema,
  /** What the workspace chose; null means the default. */
  chosen: modelIdSchema.nullable(),
  /** The default for this Dossier, used when nothing is chosen. */
  defaultModel: modelIdSchema,
  /** The keys the workspace brought, at most one a provider. */
  keys: z.array(intelligenceKeySchema),
  /** Providers whose models run on Dossier's own key while the workspace has none. */
  dossierKeys: z.array(providerIdSchema),
  /** False when this Dossier can't keep keys safe: CONNECTOR_SECRET_KEY is unset. */
  canStoreKeys: z.boolean(),
  /** The last 30 days, one row per kind that ran. */
  spend: z.array(intelligenceSpendSchema),
  /** The median tokens of recent client runs, or a typical run before any. */
  typicalRun: modelUsageSchema,
  preferences: intelligencePreferencesSchema,
});
export type IntelligenceSettings = z.infer<typeof intelligenceSettingsSchema>;

/** PUT /intelligence. Null goes back to the default. */
export const intelligenceUpdateSchema = z.object({
  model: modelIdSchema.nullable(),
});
export type IntelligenceUpdate = z.infer<typeof intelligenceUpdateSchema>;
