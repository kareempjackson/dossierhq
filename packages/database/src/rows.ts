import type {
  AskAnswer,
  AskStatus,
  AskSummary,
  AttentionItem,
  AuditEntry,
  Client,
  Commitment,
  Connector,
  Contract,
  ContractDocument,
  Device,
  Invite,
  LogoType,
  Meeting,
  MeetingNote,
  MeetingPoints,
  Pattern,
  PlatformPerson,
  Recipient,
  Recommendation,
  Report,
  ReportDelivery,
  ReportQuestion,
  ReportSummary,
  Source,
  Staff,
  StaffAuditEntry,
  StaffInvite,
  SupportGrant,
  Ticket,
  Tool,
  User,
  WeeklyTime,
  Workspace,
  WorkspaceSummary,
} from '@dossierhq/contracts';
import type {
  AccountSetup,
  AskChanges,
  ClientLink,
  ConnectorChanges,
  ConnectorRecord,
  DeliveryRecord,
  EventRecord,
  IntelligenceRun,
  InviteRecord,
  MeetingPointsRecord,
  Membership,
  MfaRecord,
  NewEventRecord,
  NotificationRecord,
  RecommendationChanges,
  ReportQuestionChanges,
  SessionRecord,
  SignUpRecord,
  StaffInviteRecord,
  StaffRecord,
  StaffSessionRecord,
  StoredReportSettings,
  SupportGrantRecord,
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
  ...UNREAD,
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

export const toSignUp = (row: Row): SignUpRecord => ({
  tokenHash: text(row.token_hash),
  email: text(row.email),
  passwordHash: text(row.password_hash),
  browserHash: textOrNull(row.browser_hash),
  timeZone: text(row.time_zone),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
});

export const signUpRow = (signUp: SignUpRecord) => ({
  token_hash: signUp.tokenHash,
  email: signUp.email.toLowerCase(),
  password_hash: signUp.passwordHash,
  browser_hash: signUp.browserHash,
  time_zone: signUp.timeZone,
  created_at: signUp.createdAt,
  expires_at: signUp.expiresAt,
});

/** From a user's row, with their two-factor's `enabled_at` alongside. */
export const toAccountSetup = (row: Row): AccountSetup => ({
  onboardedAt: isoOrNull(row.onboarded_at),
  twoFactorRequired: row.two_factor_required === true,
  twoFactorOn: row.enabled_at != null,
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
  ...contractColumns(client.contract),
  domains: client.domains,
  created_at: at,
});

/** The contract columns of `clients`, set together or cleared together. */
export const contractColumns = (contract: Contract | null) => ({
  contract_plan: contract?.plan ?? null,
  contract_started_on: contract?.startedOn ?? null,
  contract_renews_on: contract?.renewsOn ?? null,
  contract_monthly_fee: contract?.monthlyFee ?? null,
  contract_currency: contract?.currency ?? null,
  contract_includes: contract?.includes ?? null,
});

/** Every column of `contract_documents` but the content. */
export const CONTRACT_DOCUMENT_COLUMNS = [
  'id',
  'client_id',
  'name',
  'content_type',
  'size',
  'uploaded_by',
  'uploaded_by_name',
  'uploaded_at',
] as const;

export const toContractDocument = (row: Row): ContractDocument => ({
  id: text(row.id),
  clientId: text(row.client_id),
  name: text(row.name),
  contentType: text(row.content_type) as ContractDocument['contentType'],
  size: Number(row.size),
  uploadedAt: iso(row.uploaded_at),
  uploadedBy: {
    userId: textOrNull(row.uploaded_by),
    name: text(row.uploaded_by_name),
  },
});

export const contractDocumentRow = (
  workspaceId: string,
  document: ContractDocument,
) => ({
  id: document.id,
  workspace_id: workspaceId,
  client_id: document.clientId,
  name: document.name,
  content_type: document.contentType,
  size: document.size,
  uploaded_by: document.uploadedBy.userId,
  uploaded_by_name: document.uploadedBy.name,
  uploaded_at: document.uploadedAt,
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
  if (row.kind === 'note') {
    return {
      ...base,
      kind: 'note',
      tool: null,
      noteId: text(row.note_id),
      quote: textOrNull(row.quote),
    };
  }
  return { ...base, kind: 'record', tool: text(row.tool) as Tool };
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
  readAt: null,
  recordingSourceId: text(row.recording_source_id),
});

/** Nothing read yet. */
const UNREAD: MeetingPoints = {
  planning: [],
  concerns: [],
  askedFor: [],
  readAt: null,
};

/**
 * A meeting or notes with what Claude last read from them, once a read has
 * worked. Until then a meeting keeps its own points (the demo's), and notes
 * have none. Notes back in the inbox keep none either: what was read
 * belonged to their old client.
 */
export function withPoints<
  T extends MeetingPoints & { clientId: string | null },
>(item: T, points: MeetingPointsRecord | undefined): T {
  if (!points?.readAt || item.clientId === null) return item;
  const { planning, concerns, askedFor, readAt } = points;
  return { ...item, planning, concerns, askedFor, readAt };
}

export const toMeetingPoints = (row: Row): MeetingPointsRecord => ({
  id: text(row.id),
  subject: row.note_id == null ? 'meeting' : 'note',
  inputHash: text(row.input_hash),
  status: text(row.status) as MeetingPointsRecord['status'],
  runId: textOrNull(row.run_id),
  planning: row.planning as MeetingPointsRecord['planning'],
  concerns: row.concerns as MeetingPointsRecord['concerns'],
  askedFor: row.asked_for as MeetingPointsRecord['askedFor'],
  attemptedAt: iso(row.attempted_at),
  readAt: isoOrNull(row.read_at),
});

export const meetingPointsRow = (
  workspaceId: string,
  record: MeetingPointsRecord,
) => ({
  id: record.id,
  workspace_id: workspaceId,
  meeting_id: record.subject === 'meeting' ? record.id : null,
  note_id: record.subject === 'note' ? record.id : null,
  input_hash: record.inputHash,
  status: record.status,
  run_id: record.runId,
  planning: record.planning,
  concerns: record.concerns,
  asked_for: record.askedFor,
  attempted_at: record.attemptedAt,
  read_at: record.readAt,
  missing_since: null,
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
  'edited_at',
  'sent_at',
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
  editedAt: isoOrNull(row.edited_at),
  sentAt: isoOrNull(row.sent_at),
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
  edited_at: report.editedAt,
  sent_at: report.sentAt,
  title: report.title,
  glance: report.glance,
  sections: report.sections,
  sources: report.sources,
});

// Report delivery -------------------------------------------------------------

const weeklyTime = (weekday: unknown, hour: unknown): WeeklyTime | null =>
  weekday == null || hour == null
    ? null
    : { weekday: Number(weekday), hour: Number(hour) };

export const toReportSettings = (row: Row): StoredReportSettings => ({
  senderName: text(row.sender_name),
  replyTo: textOrNull(row.reply_to),
  brandColour: text(row.brand_colour),
  logo:
    row.logo == null
      ? null
      : { type: text(row.logo_type) as LogoType, base64: text(row.logo) },
  draftAt: weeklyTime(row.draft_weekday, row.draft_hour),
  sendAt: weeklyTime(row.send_weekday, row.send_hour),
  sendFrom: isoOrNull(row.send_from),
});

/** Every column but drafted_week, which only the scheduler writes. */
export const reportSettingsRow = (
  workspaceId: string,
  settings: StoredReportSettings,
) => ({
  workspace_id: workspaceId,
  sender_name: settings.senderName,
  reply_to: settings.replyTo,
  brand_colour: settings.brandColour,
  logo: settings.logo?.base64 ?? null,
  logo_type: settings.logo?.type ?? null,
  draft_weekday: settings.draftAt?.weekday ?? null,
  draft_hour: settings.draftAt?.hour ?? null,
  send_weekday: settings.sendAt?.weekday ?? null,
  send_hour: settings.sendAt?.hour ?? null,
  send_from: settings.sendFrom,
});

export const toRecipient = (row: Row): Recipient => ({
  name: text(row.name),
  email: text(row.email),
  copy: Boolean(row.copy),
});

export const recipientRows = (
  workspaceId: string,
  clientId: string,
  recipients: Recipient[],
) =>
  recipients.map((recipient, position) => ({
    workspace_id: workspaceId,
    client_id: clientId,
    position,
    name: recipient.name,
    email: recipient.email,
    copy: recipient.copy,
  }));

export const toDelivery = (row: Row): ReportDelivery => ({
  id: text(row.id),
  reportId: text(row.report_id),
  clientId: text(row.client_id),
  at: iso(row.at),
  to: list(row.to_addresses),
  cc: list(row.cc_addresses),
  outcome: text(row.outcome) as ReportDelivery['outcome'],
  problem: textOrNull(row.problem),
  sentBy:
    row.sent_by_name == null
      ? null
      : { userId: textOrNull(row.sent_by), name: text(row.sent_by_name) },
});

export const deliveryRow = (workspaceId: string, delivery: DeliveryRecord) => ({
  id: delivery.id,
  workspace_id: workspaceId,
  report_id: delivery.reportId,
  client_id: delivery.clientId,
  at: delivery.at,
  to_addresses: delivery.to,
  cc_addresses: delivery.cc,
  outcome: delivery.outcome,
  problem: delivery.problem,
  message_id: delivery.messageId,
  sent_by: delivery.sentBy?.userId ?? null,
  sent_by_name: delivery.sentBy?.name ?? null,
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

/** A new account: it hasn't been through onboarding yet. */
export const userRow = (user: UserRecord, at: string) => ({
  id: user.id,
  email: user.email.toLowerCase(),
  name: user.name,
  title: user.title,
  password_hash: user.passwordHash,
  created_at: at,
  onboarded_at: null,
  two_factor_required: null,
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
  quote: source.kind === 'record' ? null : source.quote,
  note_id: source.kind === 'note' ? source.noteId : null,
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

// Ask Dossier ---------------------------------------------------------------

/** The columns history lists: everything but the answer. */
export const ASK_SUMMARY_COLUMNS = [
  'id',
  'question',
  'status',
  'answered',
  'asked_by',
  'asked_by_name',
  'clients',
  'asked_at',
  'finished_at',
] as const;

export const toAskSummary = (row: Row): AskSummary => ({
  id: text(row.id),
  question: text(row.question),
  status: text(row.status) as AskStatus,
  answered: row.answered == null ? null : Boolean(row.answered),
  askedBy: { userId: textOrNull(row.asked_by), name: text(row.asked_by_name) },
  clients: (row.clients ?? []) as AskSummary['clients'],
  askedAt: iso(row.asked_at),
  finishedAt: isoOrNull(row.finished_at),
});

export const toAskAnswer = (row: Row): AskAnswer => ({
  ...toAskSummary(row),
  lines: (row.lines ?? []) as AskAnswer['lines'],
  sources: (row.sources ?? []) as AskAnswer['sources'],
  model: textOrNull(row.model),
  cost: row.cost == null ? null : Number(row.cost),
  error: textOrNull(row.error),
});

export const askRow = (workspaceId: string, answer: AskAnswer) => ({
  id: answer.id,
  workspace_id: workspaceId,
  question: answer.question,
  status: answer.status,
  answered: answer.answered,
  asked_by: answer.askedBy.userId,
  asked_by_name: answer.askedBy.name,
  clients: answer.clients,
  lines: answer.lines,
  sources: answer.sources,
  model: answer.model,
  cost: answer.cost,
  error: answer.error,
  asked_at: answer.askedAt,
  finished_at: answer.finishedAt,
});

/** Only the columns that change. */
export function askChangesRow(changes: AskChanges) {
  return {
    ...(changes.status !== undefined && { status: changes.status }),
    ...(changes.answered !== undefined && { answered: changes.answered }),
    ...(changes.clients !== undefined && { clients: changes.clients }),
    ...(changes.lines !== undefined && { lines: changes.lines }),
    ...(changes.sources !== undefined && { sources: changes.sources }),
    ...(changes.model !== undefined && { model: changes.model }),
    ...(changes.cost !== undefined && { cost: changes.cost }),
    ...(changes.error !== undefined && { error: changes.error }),
    ...(changes.finishedAt !== undefined && {
      finished_at: changes.finishedAt,
    }),
  };
}

// Patterns ------------------------------------------------------------------

export const toPattern = (row: Row): Pattern => ({
  id: text(row.id),
  title: text(row.title),
  why: text(row.why),
  suggestion: text(row.suggestion),
  clients: row.clients as Pattern['clients'],
  createdAt: iso(row.created_at),
});

/** Every pattern as a row, numbered in order. */
export const patternRows = (workspaceId: string, patterns: Pattern[]) =>
  patterns.map((pattern, position) => ({
    id: pattern.id,
    workspace_id: workspaceId,
    position,
    title: pattern.title,
    why: pattern.why,
    suggestion: pattern.suggestion,
    clients: pattern.clients,
    created_at: pattern.createdAt,
  }));

// Events and notifications ------------------------------------------------------

export const toEventRecord = (row: Row): EventRecord => ({
  id: text(row.id),
  workspaceId: text(row.workspace_id),
  type: text(row.type),
  actorUserId: textOrNull(row.actor_user_id),
  payload: (row.payload ?? {}) as Record<string, unknown>,
  dedupeKey: textOrNull(row.dedupe_key),
  occurredAt: iso(row.occurred_at),
  attempts: Number(row.attempts),
});

/** A new event, due at once. */
export const eventRow = (workspaceId: string, event: NewEventRecord) => ({
  id: event.id,
  workspace_id: workspaceId,
  type: event.type,
  actor_user_id: event.actorUserId,
  payload: event.payload,
  dedupe_key: event.dedupeKey,
  occurred_at: event.occurredAt,
  next_attempt_at: event.occurredAt,
});

export const toNotification = (row: Row): NotificationRecord => ({
  id: text(row.id),
  eventId: text(row.event_id),
  userId: text(row.user_id),
  type: text(row.type),
  title: text(row.title),
  body: text(row.body ?? ''),
  link: textOrNull(row.link),
  createdAt: iso(row.created_at),
  readAt: isoOrNull(row.read_at),
  inApp: Boolean(row.in_app),
  email: Boolean(row.email),
  emailSentAt: isoOrNull(row.email_sent_at),
});

export const notificationRow = (
  workspaceId: string,
  notification: NotificationRecord,
) => ({
  id: notification.id,
  workspace_id: workspaceId,
  user_id: notification.userId,
  event_id: notification.eventId,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  link: notification.link,
  created_at: notification.createdAt,
  read_at: notification.readAt,
  in_app: notification.inApp,
  email: notification.email,
  email_sent_at: notification.emailSentAt,
});

// Staff -----------------------------------------------------------------------

export const toStaff = (row: Row): Staff => ({
  id: text(row.id),
  email: text(row.email),
  name: text(row.name),
  role: text(row.role) as Staff['role'],
  createdAt: iso(row.created_at),
  disabledAt: isoOrNull(row.disabled_at),
});

export const toStaffRecord = (row: Row): StaffRecord => ({
  ...toStaff(row),
  passwordHash: text(row.password_hash),
  totpSecret: text(row.totp_secret),
  totpLastStep: row.totp_last_step == null ? null : Number(row.totp_last_step),
  recoveryHashes: list(row.recovery_hashes),
});

export const staffRow = (staff: StaffRecord) => ({
  id: staff.id,
  email: staff.email.toLowerCase(),
  name: staff.name,
  role: staff.role,
  password_hash: staff.passwordHash,
  totp_secret: staff.totpSecret,
  totp_last_step: staff.totpLastStep,
  recovery_hashes: staff.recoveryHashes,
  created_at: staff.createdAt,
  disabled_at: staff.disabledAt,
});

export const toStaffInvite = (row: Row): StaffInvite => ({
  id: text(row.id),
  email: text(row.email),
  role: text(row.role) as StaffInvite['role'],
  invitedBy: text(row.invited_by_name),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
});

export const staffInviteRow = (invite: StaffInviteRecord) => ({
  id: invite.id,
  email: invite.email.toLowerCase(),
  role: invite.role,
  token_hash: invite.tokenHash,
  invited_by: invite.invitedByStaffId,
  invited_by_name: invite.invitedBy,
  created_at: invite.createdAt,
  expires_at: invite.expiresAt,
});

export const toStaffSession = (row: Row): StaffSessionRecord => ({
  tokenHash: text(row.token_hash),
  staffId: text(row.staff_id),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
  lastSeenAt: iso(row.last_seen_at),
});

export const staffSessionRow = (session: StaffSessionRecord) => ({
  token_hash: session.tokenHash,
  staff_id: session.staffId,
  created_at: session.createdAt,
  expires_at: session.expiresAt,
  last_seen_at: session.lastSeenAt,
});

export const toStaffAuditEntry = (row: Row): StaffAuditEntry => ({
  id: text(row.id),
  at: iso(row.at),
  staff:
    row.staff_email == null
      ? null
      : {
          id: text(row.staff_id ?? ''),
          name: text(row.staff_name),
          email: text(row.staff_email),
        },
  what: text(row.what),
  workspaceId: textOrNull(row.workspace_id),
  userId: textOrNull(row.user_id),
  outcome: text(row.outcome) as StaffAuditEntry['outcome'],
  ip: textOrNull(row.ip),
});

export const staffAuditRow = (entry: StaffAuditEntry) => ({
  id: entry.id,
  at: entry.at,
  staff_id: entry.staff?.id ?? null,
  staff_name: entry.staff?.name ?? null,
  staff_email: entry.staff?.email ?? null,
  what: entry.what,
  workspace_id: entry.workspaceId,
  user_id: entry.userId,
  outcome: entry.outcome,
  ip: entry.ip,
});

// Platform --------------------------------------------------------------------

/** A row of platform_workspaces(). */
export const toWorkspaceSummary = (row: Row): WorkspaceSummary => ({
  id: text(row.id),
  name: text(row.name),
  timeZone: text(row.time_zone),
  createdAt: iso(row.created_at),
  suspension:
    row.suspended_at == null
      ? null
      : { at: iso(row.suspended_at), reason: text(row.suspended_reason) },
  owner:
    row.owner_email == null
      ? null
      : { name: text(row.owner_name), email: text(row.owner_email) },
  members: Number(row.members),
  clients: Number(row.clients),
  connectors: Number(row.connectors),
  failingConnectors: Number(row.failing_connectors),
  lastActiveAt: isoOrNull(row.last_active_at),
});

/** A row of platform_people(). */
export const toPlatformPerson = (row: Row): PlatformPerson => ({
  id: text(row.id),
  email: text(row.email),
  name: text(row.name),
  title: text(row.title),
  createdAt: iso(row.created_at),
  workspace:
    row.workspace_id == null
      ? null
      : { id: text(row.workspace_id), name: text(row.workspace_name) },
  role: textOrNull(row.role) as PlatformPerson['role'],
  twoFactor: Boolean(row.two_factor),
  lastSeenAt: isoOrNull(row.last_seen_at),
  sessions: Number(row.sessions),
});

// Support views -----------------------------------------------------------------

export const toSupportGrant = (row: Row): SupportGrant => ({
  id: text(row.id),
  workspaceId: text(row.workspace_id),
  workspaceName: text(row.workspace_name),
  staff: { name: text(row.staff_name), email: text(row.staff_email) },
  reason: text(row.reason),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
  openedAt: isoOrNull(row.redeemed_at),
  endedAt: isoOrNull(row.ended_at),
  endedBy: textOrNull(row.ended_by),
});

export const toSupportGrantRecord = (row: Row): SupportGrantRecord => ({
  ...toSupportGrant(row),
  staffId: textOrNull(row.staff_id),
  actingUserId: textOrNull(row.acting_user_id),
  handoffHash: textOrNull(row.handoff_hash),
  handoffExpiresAt: iso(row.handoff_expires_at),
  sessionHash: textOrNull(row.session_hash),
});

export const supportGrantRow = (grant: SupportGrantRecord) => ({
  id: grant.id,
  workspace_id: grant.workspaceId,
  workspace_name: grant.workspaceName,
  staff_id: grant.staffId,
  staff_name: grant.staff.name,
  staff_email: grant.staff.email,
  reason: grant.reason,
  acting_user_id: grant.actingUserId,
  created_at: grant.createdAt,
  expires_at: grant.expiresAt,
  ended_at: grant.endedAt,
  ended_by: grant.endedBy,
  handoff_hash: grant.handoffHash,
  handoff_expires_at: grant.handoffExpiresAt,
  session_hash: grant.sessionHash,
  redeemed_at: grant.openedAt,
});
