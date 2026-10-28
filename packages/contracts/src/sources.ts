import { z } from 'zod';

/** The tools Dossier reads from. */
export const toolSchema = z.enum(['ninjaone', 'hudu', 'sharepoint', 'fathom']);
export type Tool = z.infer<typeof toolSchema>;

export const TOOL_NAMES: Record<Tool, string> = {
  ninjaone: 'NinjaOne',
  hudu: 'Hudu',
  sharepoint: 'SharePoint',
  fathom: 'Fathom',
};

const sourceFieldSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const sourceBaseSchema = z.object({
  id: z.string(),
  /** Null for workspace-level records, such as a connector's own sync log. */
  clientId: z.string().nullable(),
  tool: toolSchema,
  /** The record's ID in its tool, e.g. `ALERT-48213`. */
  recordId: z.string(),
  /** The tool's name for the record type, e.g. "Alert", "Asset", "Document". */
  recordType: z.string(),
  /** One-line description used in source lines and the sources panel. */
  title: z.string(),
  /** When the record was created or last changed in its tool. */
  recordedAt: z.iso.datetime(),
  /** Deep link to the record in its tool. */
  url: z.url(),
  /** The original record as key/value pairs, in the tool's own terms. */
  fields: z.array(sourceFieldSchema),
});

/** The field of a Fathom recording that holds Fathom's own summary, in Markdown. */
export const SUMMARY_FIELD = 'Summary';

/** A record from NinjaOne, Hudu or SharePoint. */
export const recordSourceSchema = sourceBaseSchema.extend({
  kind: z.literal('record'),
});

/** A moment in a Fathom meeting recording. */
export const meetingSourceSchema = sourceBaseSchema.extend({
  kind: z.literal('meeting'),
  tool: z.literal('fathom'),
  meetingId: z.string(),
  /** Position in the recording, `hh:mm:ss`. */
  transcriptAt: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  speakerRole: z.enum(['client', 'msp']),
  speakerName: z.string(),
  /** The speaker's words, verbatim. */
  quote: z.string(),
});

export const sourceSchema = z.discriminatedUnion('kind', [
  recordSourceSchema,
  meetingSourceSchema,
]);
export type Source = z.infer<typeof sourceSchema>;
export type RecordSource = z.infer<typeof recordSourceSchema>;
export type MeetingSource = z.infer<typeof meetingSourceSchema>;

/** A statement and the sources it rests on. */
export const citedTextSchema = z.object({
  text: z.string(),
  sourceIds: z.array(z.string()).min(1),
});
export type CitedText = z.infer<typeof citedTextSchema>;
