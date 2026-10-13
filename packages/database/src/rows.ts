import type {
  AttentionItem,
  AuditEntry,
  Client,
  Commitment,
  Connector,
  Device,
  Meeting,
  Recommendation,
  Report,
  ReportSummary,
  Source,
  User,
  Workspace,
} from '@dossierhq/contracts';
import type {
  Membership,
  RecommendationChanges,
  SessionRecord,
  UserRecord,
} from './types.js';

/**
 * Maps rows of the schema in supabase/migrations to domain objects. Shared by
 * the postgres and supabase adapters, so it accepts what either driver returns:
 * postgres.js gives Date objects and numeric strings, PostgREST gives ISO
 * strings and numbers.
 */

type Row = Record<string, unknown>;

const text = (value: unknown) => String(value);
const textOrNull = (value: unknown) => (value == null ? null : String(value));
const iso = (value: unknown) =>
  (value instanceof Date ? value : new Date(String(value))).toISOString();
const isoOrNull = (value: unknown) => (value == null ? null : iso(value));
const day = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
const dayOrNull = (value: unknown) => (value == null ? null : day(value));
const list = (value: unknown) => (value ?? []) as string[];

export const toWorkspace = (row: Row): Workspace => ({
  id: text(row.id),
  name: text(row.name),
  timeZone: text(row.time_zone),
});

export const toUser = (row: Row): User => ({
  id: text(row.id),
  email: text(row.email),
  name: text(row.name),
  title: text(row.title),
});

export const toUserRecord = (row: Row): UserRecord => ({
  ...toUser(row),
  passwordHash: text(row.password_hash),
});

export const toMembership = (row: Row): Membership => ({
  workspaceId: text(row.workspace_id),
  userId: text(row.user_id),
  role: text(row.role) as Membership['role'],
});

export const toSession = (row: Row): SessionRecord => ({
  tokenHash: text(row.token_hash),
  userId: text(row.user_id),
  workspaceId: text(row.workspace_id),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
});

export const toClient = (row: Row): Client => ({
  id: text(row.id),
  name: text(row.name),
  industry: text(row.industry),
  location: text(row.location),
  seats: Number(row.seats),
  primaryContact: {
    name: text(row.contact_name),
    role: text(row.contact_role),
  },
  contract: {
    plan: text(row.contract_plan),
    startedOn: day(row.contract_started_on),
    renewsOn: day(row.contract_renews_on),
    monthlyFee: Number(row.contract_monthly_fee),
    currency: text(row.contract_currency).trim(),
    includes: list(row.contract_includes),
  },
});

export function toSource(row: Row): Source {
  const base = {
    id: text(row.id),
    clientId: textOrNull(row.client_id),
    tool: text(row.tool) as Source['tool'],
    recordId: text(row.record_id),
    recordType: text(row.record_type),
    title: text(row.title),
    recordedAt: iso(row.recorded_at),
    url: text(row.url),
    fields: row.fields as Source['fields'],
  };
  if (row.kind === 'meeting') {
    return {
      ...base,
      kind: 'meeting',
      tool: 'fathom',
      meetingId: text(row.meeting_id),
      transcriptAt: text(row.transcript_at),
      speakerRole: text(row.speaker_role) as 'client' | 'msp',
      speakerName: text(row.speaker_name),
      quote: text(row.quote),
    };
  }
  return { ...base, kind: 'record' };
}

export const toAttentionItem = (row: Row): AttentionItem => ({
  id: text(row.id),
  clientId: textOrNull(row.client_id),
  kind: text(row.kind) as AttentionItem['kind'],
  urgency: text(row.urgency) as AttentionItem['urgency'],
  title: text(row.title),
  raisedAt: iso(row.raised_at),
  sourceIds: list(row.source_ids),
});

export const toRecommendation = (row: Row): Recommendation => ({
  id: text(row.id),
  clientId: text(row.client_id),
  status: text(row.status) as Recommendation['status'],
  title: text(row.title),
  reason: text(row.reason),
  createdAt: iso(row.created_at),
  decidedAt: isoOrNull(row.decided_at),
  sourceIds: list(row.source_ids),
});

/** Only the columns being changed, in snake_case. */
export function recommendationChangesRow(changes: RecommendationChanges): {
  status?: string;
  title?: string;
  reason?: string;
  decided_at?: string | null;
} {
  return {
    ...(changes.status !== undefined && { status: changes.status }),
    ...(changes.title !== undefined && { title: changes.title }),
    ...(changes.reason !== undefined && { reason: changes.reason }),
    ...(changes.decidedAt !== undefined && { decided_at: changes.decidedAt }),
  };
}

export const toCommitment = (row: Row): Commitment => ({
  id: text(row.id),
  clientId: text(row.client_id),
  statement: text(row.statement),
  madeAt: iso(row.made_at),
  dueOn: dayOrNull(row.due_on),
  status: text(row.status) as Commitment['status'],
  completedAt: isoOrNull(row.completed_at),
  sourceIds: list(row.source_ids),
});

export const toMeeting = (row: Row): Meeting => ({
  id: text(row.id),
  clientId: text(row.client_id),
  title: text(row.title),
  occurredAt: iso(row.occurred_at),
  durationMinutes: Number(row.duration_minutes),
  attendees: row.attendees as Meeting['attendees'],
  planning: row.planning as Meeting['planning'],
  concerns: row.concerns as Meeting['concerns'],
  askedFor: row.asked_for as Meeting['askedFor'],
  recordingSourceId: text(row.recording_source_id),
});

export const toDevice = (row: Row): Device => ({
  id: text(row.id),
  clientId: text(row.client_id),
  name: text(row.name),
  type: text(row.type) as Device['type'],
  os: text(row.os),
  assignedTo: textOrNull(row.assigned_to),
  lastSeenAt: iso(row.last_seen_at),
  patchStatus: text(row.patch_status) as Device['patchStatus'],
  sourceId: text(row.source_id),
});

/** Columns a summary needs; a full report adds title, glance and sections. */
export const REPORT_SUMMARY_COLUMNS = [
  'id',
  'client_id',
  'week_start',
  'week_end',
  'status',
  'generated_at',
  'approved_at',
  'exceptions',
] as const;

export const toReportSummary = (row: Row): ReportSummary => ({
  id: text(row.id),
  clientId: text(row.client_id),
  weekStart: day(row.week_start),
  weekEnd: day(row.week_end),
  status: text(row.status) as ReportSummary['status'],
  generatedAt: iso(row.generated_at),
  exceptions: list(row.exceptions),
  approvedAt: isoOrNull(row.approved_at),
});

export const toReport = (row: Row): Report => ({
  ...toReportSummary(row),
  title: text(row.title),
  glance: row.glance as Report['glance'],
  sections: row.sections as Report['sections'],
});

export const toConnector = (row: Row): Connector => ({
  id: text(row.id),
  tool: text(row.tool) as Connector['tool'],
  scope: text(row.scope),
  access: text(row.access),
  status: text(row.status) as Connector['status'],
  lastSyncAt: iso(row.last_sync_at),
  failure: (row.failure ?? null) as Connector['failure'],
});

export const toAuditEntry = (row: Row): AuditEntry => ({
  id: text(row.id),
  at: iso(row.at),
  tool: text(row.tool) as AuditEntry['tool'],
  read: text(row.read),
  clientId: textOrNull(row.client_id),
  recordCount: Number(row.record_count),
});
