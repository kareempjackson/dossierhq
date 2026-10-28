import type {
  AttentionItem,
  AuditEntry,
  Client,
  Commitment,
  Connector,
  Device,
  Invite,
  Meeting,
  MeetingNote,
  Recommendation,
  Report,
  ReportQuestion,
  ReportSummary,
  Source,
  Ticket,
  Tool,
  User,
  Workspace,
} from '@dossierhq/contracts';
import type {
  ClientLink,
  ConnectorChanges,
  ConnectorRecord,
  IntelligenceRun,
  InviteRecord,
  Membership,
  MfaRecord,
  RecommendationChanges,
  ReportQuestionChanges,
  SessionRecord,
  ToolRecords,
  UserRecord,
} from './types.js';

/**
 * Maps rows of the schema in supabase/migrations to domain objects and back.
 * Shared by the postgres and supabase adapters, so it accepts what either
 * driver returns: postgres.js gives Date objects and numeric strings,
 * PostgREST gives ISO strings and numbers. Rows going in are plain JSON, keyed
 * by column, with every column present (the SQL functions insert whole rows).
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

export const toInvite = (row: Row): Invite => ({
  id: text(row.id),
  email: text(row.email),
  role: text(row.role) as Invite['role'],
  invitedBy: text(row.invited_by_name),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
});

export const inviteRow = (workspaceId: string, invite: InviteRecord) => ({
  id: invite.id,
  workspace_id: workspaceId,
  email: invite.email.toLowerCase(),
  role: invite.role,
  token_hash: invite.tokenHash,
  invited_by: invite.invitedByUserId,
  invited_by_name: invite.invitedBy,
  created_at: invite.createdAt,
  expires_at: invite.expiresAt,
});

export const toNote = (row: Row): MeetingNote => ({
  id: text(row.id),
  clientId: textOrNull(row.client_id),
  title: text(row.title),
  occurredOn: day(row.occurred_on),
  attendees: list(row.attendees),
  body: text(row.body),
  via: text(row.via) as MeetingNote['via'],
  addedBy: {
    userId: textOrNull(row.added_by),
    name: text(row.added_by_name),
  },
  createdAt: iso(row.created_at),
});

export const noteRow = (workspaceId: string, note: MeetingNote) => ({
  id: note.id,
  workspace_id: workspaceId,
  client_id: note.clientId,
  title: note.title,
  occurred_on: note.occurredOn,
  attendees: note.attendees,
  body: note.body,
  via: note.via,
  added_by: note.addedBy.userId,
  added_by_name: note.addedBy.name,
  created_at: note.createdAt,
});

export const toMfa = (row: Row): MfaRecord => ({
  userId: text(row.user_id),
  secret: text(row.secret),
  enabledAt: row.enabled_at == null ? null : iso(row.enabled_at),
  lastStep: row.last_step == null ? null : Number(row.last_step),
  recoveryHashes: (row.recovery_hashes as string[] | null) ?? [],
  createdAt: iso(row.created_at),
});

export const toSession = (row: Row): SessionRecord => ({
  tokenHash: text(row.token_hash),
  userId: text(row.user_id),
  workspaceId: text(row.workspace_id),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
  lastSeenAt: iso(row.last_seen_at),
});

export const toClient = (row: Row): Client => ({
  id: text(row.id),
  name: text(row.name),
  industry: textOrNull(row.industry),
  location: textOrNull(row.location),
  seats: row.seats == null ? null : Number(row.seats),
  primaryContact:
    row.contact_name == null
      ? null
      : { name: text(row.contact_name), role: text(row.contact_role ?? '') },
  contract:
    row.contract_plan == null
      ? null
      : {
          plan: text(row.contract_plan),
          startedOn: day(row.contract_started_on),
          renewsOn: day(row.contract_renews_on),
          monthlyFee: Number(row.contract_monthly_fee),
          currency: text(row.contract_currency).trim(),
          includes: list(row.contract_includes),
        },
  domains: list(row.domains),
});

/** Every column of `clients`, for a sync to upsert. */
export const clientRow = (workspaceId: string, client: Client, at: string) => ({
  id: client.id,
  workspace_id: workspaceId,
  name: client.name,
  industry: client.industry,
  location: client.location,
  seats: client.seats,
  contact_name: client.primaryContact?.name ?? null,
  contact_role: client.primaryContact?.role ?? null,
  contract_plan: client.contract?.plan ?? null,
  contract_started_on: client.contract?.startedOn ?? null,
  contract_renews_on: client.contract?.renewsOn ?? null,
  contract_monthly_fee: client.contract?.monthlyFee ?? null,
  contract_currency: client.contract?.currency ?? null,
  contract_includes: client.contract?.includes ?? null,
  domains: client.domains,
  created_at: at,
});

export const toClientLink = (row: Row): ClientLink => ({
  tool: text(row.tool) as Tool,
  externalId: text(row.external_id),
  clientId: text(row.client_id),
  name: text(row.name),
  url: text(row.url),
});

export const clientLinkRow = (workspaceId: string, link: ClientLink) => ({
  workspace_id: workspaceId,
  tool: link.tool,
  external_id: link.externalId,
  client_id: link.clientId,
  name: link.name,
  url: link.url,
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

/**
 * Only the columns being changed, in snake_case. New wording marks it edited,
 * so a later run leaves it alone.
 */
export function recommendationChangesRow(changes: RecommendationChanges): {
  status?: string;
  title?: string;
  reason?: string;
  decided_at?: string | null;
  edited?: boolean;
} {
  return {
    ...(changes.status !== undefined && { status: changes.status }),
    ...(changes.title !== undefined && { title: changes.title }),
    ...(changes.reason !== undefined && { reason: changes.reason }),
    ...(changes.decidedAt !== undefined && { decided_at: changes.decidedAt }),
    ...((changes.title !== undefined || changes.reason !== undefined) && {
      edited: true,
    }),
  };
}

/** A draft a run made, as a whole row. */
export const recommendationDraftRow = (
  workspaceId: string,
  runId: string,
  rec: Recommendation,
) => ({
  id: rec.id,
  workspace_id: workspaceId,
  client_id: rec.clientId,
  status: rec.status,
  title: rec.title,
  reason: rec.reason,
  created_at: rec.createdAt,
  decided_at: rec.decidedAt,
  source_ids: rec.sourceIds,
  run_id: runId,
  edited: false,
});

export const toIntelligenceRun = (row: Row): IntelligenceRun => ({
  id: text(row.id),
  clientId: textOrNull(row.client_id),
  kind: text(row.kind) as IntelligenceRun['kind'],
  inputHash: textOrNull(row.input_hash),
  model: text(row.model),
  usage: row.usage as IntelligenceRun['usage'],
  cost: Number(row.cost),
  status: text(row.status) as IntelligenceRun['status'],
  error: textOrNull(row.error),
  startedAt: iso(row.started_at),
  finishedAt: iso(row.finished_at),
});

export const intelligenceRunRow = (
  workspaceId: string,
  run: IntelligenceRun,
) => ({
  id: run.id,
  workspace_id: workspaceId,
  client_id: run.clientId,
  kind: run.kind,
  input_hash: run.inputHash,
  model: run.model,
  usage: run.usage,
  cost: run.cost,
  status: run.status,
  error: run.error,
  started_at: run.startedAt,
  finished_at: run.finishedAt,
});

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

export const toTicket = (row: Row): Ticket => ({
  id: text(row.id),
  clientId: text(row.client_id),
  number: text(row.number),
  subject: text(row.subject),
  status: text(row.status),
  open: Boolean(row.open),
  urgency: text(row.urgency) as Ticket['urgency'],
  requester: textOrNull(row.requester),
  assignedTo: textOrNull(row.assigned_to),
  openedAt: iso(row.opened_at),
  updatedAt: iso(row.updated_at),
  sourceId: text(row.source_id),
});

/** Columns a summary needs; a full report adds title, glance, sections and sources. */
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
  sources: (row.sources ?? []) as Report['sources'],
});

export const reportRow = (workspaceId: string, report: Report) => ({
  id: report.id,
  workspace_id: workspaceId,
  client_id: report.clientId,
  week_start: report.weekStart,
  week_end: report.weekEnd,
  status: report.status,
  generated_at: report.generatedAt,
  approved_at: report.approvedAt,
  exceptions: report.exceptions,
  title: report.title,
  glance: report.glance,
  sections: report.sections,
  sources: report.sources,
});

export const toConnector = (row: Row): Connector => ({
  id: text(row.id),
  tool: text(row.tool) as Connector['tool'],
  account: text(row.account ?? ''),
  scope: text(row.scope),
  access: text(row.access),
  status: text(row.status) as Connector['status'],
  lastSyncAt: isoOrNull(row.last_sync_at),
  failure: (row.failure ?? null) as Connector['failure'],
});

export const toConnectorRecord = (row: Row): ConnectorRecord => ({
  ...toConnector(row),
  credentials: text(row.credentials ?? ''),
  state: (row.state ?? {}) as ConnectorRecord['state'],
});

export const connectorRow = (workspaceId: string, record: ConnectorRecord) => ({
  id: record.id,
  workspace_id: workspaceId,
  tool: record.tool,
  account: record.account,
  scope: record.scope,
  access: record.access,
  status: record.status,
  last_sync_at: record.lastSyncAt,
  failure: record.failure,
  credentials: record.credentials,
  state: record.state,
});

/** Only the columns being changed, in snake_case. */
export function connectorChangesRow(changes: ConnectorChanges) {
  const columns = {
    account: 'account',
    scope: 'scope',
    access: 'access',
    status: 'status',
    lastSyncAt: 'last_sync_at',
    failure: 'failure',
    credentials: 'credentials',
    state: 'state',
  } as const;
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const value = changes[key as keyof ConnectorChanges];
    if (value !== undefined) row[column] = value;
  }
  return row;
}

export const toAuditEntry = (row: Row): AuditEntry => ({
  id: text(row.id),
  at: iso(row.at),
  kind: text(row.kind) as AuditEntry['kind'],
  tool: textOrNull(row.tool) as AuditEntry['tool'],
  what: text(row.what),
  clientId: textOrNull(row.client_id),
  recordCount: Number(row.record_count),
  outcome: text(row.outcome) as AuditEntry['outcome'],
  actor:
    row.actor_email == null
      ? null
      : {
          userId: textOrNull(row.actor_user_id),
          name: text(row.actor_name),
          email: text(row.actor_email),
        },
  ip: textOrNull(row.ip),
});

export const auditRow = (workspaceId: string, entry: AuditEntry) => ({
  id: entry.id,
  workspace_id: workspaceId,
  at: entry.at,
  kind: entry.kind,
  tool: entry.tool,
  what: entry.what,
  client_id: entry.clientId,
  record_count: entry.recordCount,
  outcome: entry.outcome,
  actor_user_id: entry.actor?.userId ?? null,
  actor_name: entry.actor?.name ?? null,
  actor_email: entry.actor?.email ?? null,
  ip: entry.ip,
});

export const workspaceRow = (workspace: Workspace) => ({
  id: workspace.id,
  name: workspace.name,
  time_zone: workspace.timeZone,
});

export const userRow = (user: UserRecord, at: string) => ({
  id: user.id,
  email: user.email.toLowerCase(),
  name: user.name,
  title: user.title,
  password_hash: user.passwordHash,
  created_at: at,
});

// A tool's records, as whole rows for replace_tool_records -------------------

export const sourceRow = (workspaceId: string, source: Source) => ({
  id: source.id,
  workspace_id: workspaceId,
  client_id: source.clientId,
  kind: source.kind,
  tool: source.tool,
  record_id: source.recordId,
  record_type: source.recordType,
  title: source.title,
  recorded_at: source.recordedAt,
  url: source.url,
  fields: source.fields,
  meeting_id: source.kind === 'meeting' ? source.meetingId : null,
  transcript_at: source.kind === 'meeting' ? source.transcriptAt : null,
  speaker_role: source.kind === 'meeting' ? source.speakerRole : null,
  speaker_name: source.kind === 'meeting' ? source.speakerName : null,
  quote: source.kind === 'meeting' ? source.quote : null,
});

const deviceRow = (workspaceId: string, tool: Tool, device: Device) => ({
  id: device.id,
  workspace_id: workspaceId,
  client_id: device.clientId,
  name: device.name,
  type: device.type,
  os: device.os,
  assigned_to: device.assignedTo,
  last_seen_at: device.lastSeenAt,
  patch_status: device.patchStatus,
  source_id: device.sourceId,
  tool,
});

const ticketRow = (workspaceId: string, tool: Tool, ticket: Ticket) => ({
  id: ticket.id,
  workspace_id: workspaceId,
  client_id: ticket.clientId,
  number: ticket.number,
  subject: ticket.subject,
  status: ticket.status,
  open: ticket.open,
  urgency: ticket.urgency,
  requester: ticket.requester,
  assigned_to: ticket.assignedTo,
  opened_at: ticket.openedAt,
  updated_at: ticket.updatedAt,
  source_id: ticket.sourceId,
  tool,
});

const meetingRow = (workspaceId: string, tool: Tool, meeting: Meeting) => ({
  id: meeting.id,
  workspace_id: workspaceId,
  client_id: meeting.clientId,
  title: meeting.title,
  occurred_at: meeting.occurredAt,
  duration_minutes: meeting.durationMinutes,
  attendees: meeting.attendees,
  planning: meeting.planning,
  concerns: meeting.concerns,
  asked_for: meeting.askedFor,
  recording_source_id: meeting.recordingSourceId,
  tool,
});

const commitmentRow = (
  workspaceId: string,
  tool: Tool,
  commitment: Commitment,
) => ({
  id: commitment.id,
  workspace_id: workspaceId,
  client_id: commitment.clientId,
  statement: commitment.statement,
  made_at: commitment.madeAt,
  due_on: commitment.dueOn,
  status: commitment.status,
  completed_at: commitment.completedAt,
  source_ids: commitment.sourceIds,
  tool,
});

const attentionRow = (
  workspaceId: string,
  tool: Tool,
  item: AttentionItem,
) => ({
  id: item.id,
  workspace_id: workspaceId,
  client_id: item.clientId,
  kind: item.kind,
  urgency: item.urgency,
  title: item.title,
  raised_at: item.raisedAt,
  source_ids: item.sourceIds,
  tool,
});

/** The JSON replace_tool_records and upsert_tool_records take. */
export function toolRecordsPayload(
  workspaceId: string,
  tool: Tool,
  records: Partial<ToolRecords>,
) {
  return {
    sources: (records.sources ?? []).map((s) => sourceRow(workspaceId, s)),
    devices: (records.devices ?? []).map((d) =>
      deviceRow(workspaceId, tool, d),
    ),
    tickets: (records.tickets ?? []).map((t) =>
      ticketRow(workspaceId, tool, t),
    ),
    meetings: (records.meetings ?? []).map((m) =>
      meetingRow(workspaceId, tool, m),
    ),
    commitments: (records.commitments ?? []).map((c) =>
      commitmentRow(workspaceId, tool, c),
    ),
    attention: (records.attention ?? []).map((a) =>
      attentionRow(workspaceId, tool, a),
    ),
  };
}

// Report questions ------------------------------------------------------------

export const toReportQuestion = (row: Row): ReportQuestion => ({
  id: text(row.id),
  clientId: textOrNull(row.client_id),
  text: text(row.text),
  createdAt: iso(row.created_at),
});

export const reportQuestionRow = (
  workspaceId: string,
  question: ReportQuestion,
) => ({
  id: question.id,
  workspace_id: workspaceId,
  client_id: question.clientId,
  text: question.text,
  created_at: question.createdAt,
});

/** Only the columns that change. */
export function reportQuestionChangesRow(changes: ReportQuestionChanges): {
  text?: string;
  client_id?: string | null;
} {
  return {
    ...(changes.text !== undefined && { text: changes.text }),
    ...(changes.clientId !== undefined && { client_id: changes.clientId }),
  };
}
