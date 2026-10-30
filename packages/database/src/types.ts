import type {
  AskAnswer,
  AskSummary,
  AttentionItem,
  AuditCount,
  AuditEntry,
  AuditKind,
  CitedText,
  Client,
  ClientListItem,
  Commitment,
  Connector,
  Contract,
  ContractDocument,
  Device,
  IntelligenceKind,
  Invite,
  Meeting,
  MeetingNote,
  Member,
  ModelUsage,
  Recipient,
  Recommendation,
  RecommendationStatus,
  Report,
  ReportDelivery,
  ReportQuestion,
  ReportStatus,
  ReportSummary,
  NoteSource,
  Pattern,
  Source,
  Ticket,
  Tool,
  User,
  WeeklyTime,
  LogoType,
  Workspace,
  WorkspaceRole,
} from '@dossierhq/contracts';
import type { DatabaseProvider } from './config.js';

/** Everything one workspace holds; what the memory adapter can start from. */
export interface Dataset {
  workspace: Workspace;
  /** People who can sign in, with their password hashes. */
  users: UserRecord[];
  memberships: Membership[];
  clients: Client[];
  /** When the user last opened each client. */
  clientViews: { clientId: string; viewedAt: string }[];
  sources: Source[];
  attentionItems: AttentionItem[];
  recommendations: Recommendation[];
  commitments: Commitment[];
  meetings: Meeting[];
  devices: Device[];
  tickets: Ticket[];
  reports: Report[];
  connectors: Connector[];
  auditLog: AuditEntry[];
}

/**
 * The ports. Application code depends only on these interfaces; each adapter
 * under `src/adapters/*` implements them for one database, and all of them
 * pass the same contract suite in `src/testing`.
 *
 * Every method takes the workspace first: nothing is ever read or written
 * outside the caller's workspace. Orderings are part of the contract and live
 * in `ordering.ts`.
 */

export interface WorkspacesRepository {
  get(workspaceId: string): Promise<Workspace | null>;
  create(workspace: Workspace): Promise<void>;
}

export interface ClientsRepository {
  /** By name. */
  list(workspaceId: string): Promise<Client[]>;
  get(workspaceId: string, clientId: string): Promise<Client | null>;
  /** Each client with what's current there, most urgent first. */
  overview(workspaceId: string): Promise<ClientListItem[]>;
  /** Most recently opened first. */
  recent(workspaceId: string, limit: number): Promise<Client[]>;
  /** Notes that the user opened a client at `at`. False if there's no such client. */
  recordView(
    workspaceId: string,
    clientId: string,
    at: string,
  ): Promise<boolean>;
  /** Where every client lives in each tool. */
  links(workspaceId: string): Promise<ClientLink[]>;
  /**
   * Sets the contract someone entered, or with null clears it. Syncs leave
   * it alone. Null when there's no such client.
   */
  setContract(
    workspaceId: string,
    clientId: string,
    contract: Contract | null,
  ): Promise<Client | null>;
  /**
   * After a tool's sync: saves the clients it created or changed (new ones
   * stamped `at`), replaces its links with `links`, and removes clients it
   * had brought in that no tool links to any more. Atomic.
   */
  sync(
    workspaceId: string,
    tool: Tool,
    changes: { clients: Client[]; links: ClientLink[] },
    at: string,
  ): Promise<void>;
}

/** Where a client lives in one tool, e.g. a NinjaOne organisation. */
export type ClientLink = {
  tool: Tool;
  externalId: string;
  clientId: string;
  /** The name the tool uses. */
  name: string;
  /** Deep link to it in the tool. */
  url: string;
};

/** Everything one sync of one tool produced. */
export type ToolRecords = {
  sources: Source[];
  devices: Device[];
  tickets: Ticket[];
  meetings: Meeting[];
  commitments: Commitment[];
  attention: AttentionItem[];
};

/**
 * What the tools wrote. Every record is tagged with its tool, so a sync swaps
 * exactly its own records and leaves the rest alone.
 */
export interface RecordsRepository {
  /** Replaces everything `tool` wrote with `records`. Atomic. */
  replace(workspaceId: string, tool: Tool, records: ToolRecords): Promise<void>;
  /** Adds or replaces these sources and attention items, keeping the rest. */
  upsert(
    workspaceId: string,
    tool: Tool,
    records: Pick<ToolRecords, 'sources' | 'attention'>,
  ): Promise<void>;
  /** Removes everything `tool` wrote, its links, and clients only it linked. */
  removeTool(workspaceId: string, tool: Tool): Promise<void>;
}

export interface AttentionRepository {
  /** Most urgent first, then newest. */
  list(
    workspaceId: string,
    filter?: { clientId?: string },
  ): Promise<AttentionItem[]>;
}

export type RecommendationChanges = {
  status?: RecommendationStatus;
  title?: string;
  reason?: string;
  decidedAt?: string | null;
};

export interface RecommendationsRepository {
  /** Newest first. */
  list(
    workspaceId: string,
    filter?: { clientId?: string; status?: RecommendationStatus },
  ): Promise<Recommendation[]>;
  get(workspaceId: string, id: string): Promise<Recommendation | null>;
  /**
   * Null when there's no such recommendation. Changing the title or reason
   * marks it edited, so a later run won't replace it.
   */
  update(
    workspaceId: string,
    id: string,
    changes: RecommendationChanges,
  ): Promise<Recommendation | null>;
  /**
   * Swaps the client's drafts from earlier runs that nobody edited for
   * `drafts`, made by run `runId`. Accepted, dismissed and edited ones stay,
   * as does anything no run made. Atomic.
   */
  replaceDrafts(
    workspaceId: string,
    clientId: string,
    runId: string,
    drafts: Recommendation[],
  ): Promise<void>;
}

/** One piece of work a model did: what it cost, and what it read. */
export type IntelligenceRun = {
  id: string;
  /** Null for work across the workspace. */
  clientId: string | null;
  kind: IntelligenceKind;
  /** A hash of what the model read; when it hasn't changed, nor has the answer. */
  inputHash: string | null;
  model: string;
  usage: ModelUsage;
  /** US dollars, at the model's prices when it ran. */
  cost: number;
  status: 'ok' | 'failed' | 'refused';
  error: string | null;
  startedAt: string;
  finishedAt: string;
};

export interface IntelligenceRepository {
  /** The model the workspace chose to draft with; null means the default. */
  model(workspaceId: string): Promise<string | null>;
  setModel(workspaceId: string, model: string | null): Promise<void>;
  /** What the workspace saved about what it wants from Claude; {} if nothing. */
  preferences(workspaceId: string): Promise<Record<string, unknown>>;
  setPreferences(
    workspaceId: string,
    preferences: Record<string, unknown>,
  ): Promise<void>;
  /** The newest run of `kind` for a client, or across the workspace for null. */
  lastRun(
    workspaceId: string,
    kind: IntelligenceKind,
    clientId: string | null,
  ): Promise<IntelligenceRun | null>;
  saveRun(workspaceId: string, run: IntelligenceRun): Promise<void>;
  /** Runs that started at or after `since`, newest first. */
  runs(workspaceId: string, since: string): Promise<IntelligenceRun[]>;
}

/** What changes about an answer while Dossier writes it. */
export type AskChanges = Partial<
  Pick<
    AskAnswer,
    | 'status'
    | 'answered'
    | 'clients'
    | 'lines'
    | 'sources'
    | 'model'
    | 'cost'
    | 'error'
    | 'finishedAt'
  >
>;

/** Questions asked of Dossier, and its answers. */
export interface AskRepository {
  /** Newest first, at most `limit`; with `askedBy`, only that person's. */
  list(
    workspaceId: string,
    query: { askedBy?: string; limit: number },
  ): Promise<AskSummary[]>;
  get(workspaceId: string, id: string): Promise<AskAnswer | null>;
  create(workspaceId: string, answer: AskAnswer): Promise<void>;
  /**
   * Changes an answer Dossier is still writing. False when it isn't: it
   * finished, failed or was deleted.
   */
  update(
    workspaceId: string,
    id: string,
    changes: AskChanges,
  ): Promise<boolean>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}

/** Patterns found across a workspace's clients. */
export interface PatternsRepository {
  /** In the order they were found, most important first. */
  list(workspaceId: string): Promise<Pattern[]>;
  /** Swaps every pattern for these, in this order. Atomic. */
  replace(workspaceId: string, patterns: Pattern[]): Promise<void>;
}

export interface CommitmentsRepository {
  /** Open first (soonest due first), then done (most recent first). */
  list(
    workspaceId: string,
    filter?: { clientId?: string },
  ): Promise<Commitment[]>;
}

export interface MeetingsRepository {
  /** Newest first, with what Claude read from each (MeetingPointsRepository). */
  list(workspaceId: string, filter?: { clientId?: string }): Promise<Meeting[]>;
}

/**
 * What Claude last read from one meeting or one set of notes. Kept apart from
 * meetings, which every Fathom sync replaces; meetings and notes read with
 * these filled in once a read has worked.
 */
export type MeetingPointsRecord = {
  /** The meeting's or the notes' ID. */
  id: string;
  subject: 'meeting' | 'note';
  /** What was read, so an unchanged meeting isn't read again. */
  inputHash: string;
  status: 'ok' | 'failed';
  runId: string | null;
  planning: CitedText[];
  concerns: CitedText[];
  askedFor: CitedText[];
  attemptedAt: string;
  /** The last read that worked; null until one has. */
  readAt: string | null;
};

export interface MeetingPointsRepository {
  /** What was last read from each of these meetings and notes, if anything. */
  states(workspaceId: string, ids: string[]): Promise<MeetingPointsRecord[]>;
  /**
   * Saves a read. For notes, `excerpts` replace the ones read before (null
   * keeps them), and nothing is saved when the notes are no longer filed
   * with `clientId`.
   */
  save(
    workspaceId: string,
    clientId: string,
    record: MeetingPointsRecord,
    excerpts: NoteSource[] | null,
  ): Promise<void>;
  /**
   * Marks reads whose meeting has gone from Fathom, unmarks those back, and
   * forgets those gone since before `before`. Notes' reads go with them.
   */
  prune(workspaceId: string, now: string, before: string): Promise<void>;
}

export interface DevicesRepository {
  /** Failed patching first, then pending, then the rest; each by name. */
  list(workspaceId: string, filter?: { clientId?: string }): Promise<Device[]>;
}

export interface TicketsRepository {
  /**
   * Open first (most urgent, then most recently updated), then closed (most
   * recently updated).
   */
  list(workspaceId: string, filter?: { clientId?: string }): Promise<Ticket[]>;
}

export interface ReportsRepository {
  /** Without bodies. Newest week first, then by client name. */
  listSummaries(
    workspaceId: string,
    filter?: { clientId?: string; status?: ReportStatus },
  ): Promise<ReportSummary[]>;
  get(workspaceId: string, id: string): Promise<Report | null>;
  /**
   * Creates the report, or replaces the one with its ID. A client has one
   * report a week, so redrafting a week reuses that week's ID.
   */
  save(workspaceId: string, report: Report): Promise<void>;
  /**
   * Sets the status of each report. `approvedAt` becomes `at` when approving
   * and null otherwise. Returns the updated summaries in the order given;
   * unknown IDs, and reports already sent, are skipped.
   */
  setStatus(
    workspaceId: string,
    ids: string[],
    status: ReportStatus,
    at: string,
  ): Promise<ReportSummary[]>;
  /**
   * Marks an approved, unsent report sent at `at`, so it can't change and
   * nothing sends it twice. False when it isn't approved or is already sent.
   */
  markSent(workspaceId: string, id: string, at: string): Promise<boolean>;
  /** Undoes markSent after a send that failed. */
  clearSent(workspaceId: string, id: string): Promise<void>;
}

/** A workspace's report settings as stored; the logo is base64. */
export type StoredReportSettings = {
  senderName: string;
  replyTo: string | null;
  brandColour: string;
  logo: { type: LogoType; base64: string } | null;
  draftAt: WeeklyTime | null;
  sendAt: WeeklyTime | null;
  /** Reports approved since then go out on schedule; null while sendAt is. */
  sendFrom: string | null;
};

export interface ReportSettingsRepository {
  /** Null until someone saves them. */
  get(workspaceId: string): Promise<StoredReportSettings | null>;
  /** Creates or replaces them, keeping which week the schedule last drafted. */
  save(workspaceId: string, settings: StoredReportSettings): Promise<void>;
  /** Every workspace with a drafting or sending schedule. Crosses workspaces. */
  listScheduled(): Promise<string[]>;
  /**
   * Notes that the schedule drafted the week starting `weekStart`. False
   * when it already had, so only one caller drafts each week.
   */
  markDrafted(workspaceId: string, weekStart: string): Promise<boolean>;
}

export interface RecipientsRepository {
  /** In the order they were saved. */
  list(workspaceId: string, clientId: string): Promise<Recipient[]>;
  /** Replaces the client's recipients. Atomic. */
  replace(
    workspaceId: string,
    clientId: string,
    recipients: Recipient[],
  ): Promise<void>;
}

export type DeliveryRecord = ReportDelivery & {
  /** The mail provider's ID for the email, when it went. */
  messageId: string | null;
};

export type ContractDocumentFile = {
  document: ContractDocument;
  content: Uint8Array;
};

export interface ContractDocumentsRepository {
  /** A client's documents, newest first, without their content. */
  list(workspaceId: string, clientId: string): Promise<ContractDocument[]>;
  /** One document with its content; null when there's no such document. */
  get(workspaceId: string, id: string): Promise<ContractDocumentFile | null>;
  add(
    workspaceId: string,
    document: ContractDocument,
    content: Uint8Array,
  ): Promise<void>;
  /** False when there was no such document. */
  remove(workspaceId: string, id: string): Promise<boolean>;
}

export interface DeliveriesRepository {
  /** Newest first. */
  list(workspaceId: string, reportId: string): Promise<ReportDelivery[]>;
  add(workspaceId: string, delivery: DeliveryRecord): Promise<void>;
}

export type ReportQuestionChanges = {
  text?: string;
  clientId?: string | null;
};

export interface ReportQuestionsRepository {
  /**
   * Oldest first. With `clientId`, the questions for that client and the ones
   * for every client.
   */
  list(
    workspaceId: string,
    filter?: { clientId?: string },
  ): Promise<ReportQuestion[]>;
  create(workspaceId: string, question: ReportQuestion): Promise<void>;
  /** Null when there's no such question. */
  update(
    workspaceId: string,
    id: string,
    changes: ReportQuestionChanges,
  ): Promise<ReportQuestion | null>;
  /** False when there's no such question. */
  remove(workspaceId: string, id: string): Promise<boolean>;
}

export interface SourcesRepository {
  /** In the order asked for. Unknown IDs are skipped. */
  getMany(workspaceId: string, ids: string[]): Promise<Source[]>;
  /** Everything read about one client, newest first. */
  listForClient(workspaceId: string, clientId: string): Promise<Source[]>;
}

export interface ConnectorsRepository {
  /** Connected tools, in tool order: NinjaOne, Hudu, SharePoint, Fathom. */
  list(workspaceId: string): Promise<Connector[]>;
  /** With its encrypted credentials and sync state; for the API only. */
  get(workspaceId: string, tool: Tool): Promise<ConnectorRecord | null>;
  /** Creates or replaces the connector for `record.tool`. */
  save(workspaceId: string, record: ConnectorRecord): Promise<void>;
  /** Null when the tool isn't connected. */
  update(
    workspaceId: string,
    tool: Tool,
    changes: ConnectorChanges,
  ): Promise<ConnectorRecord | null>;
  remove(workspaceId: string, tool: Tool): Promise<void>;
  /** Every connected tool in every workspace, for the sync scheduler. */
  listAll(): Promise<{ workspaceId: string; tool: Tool }[]>;
}

/** A connector as stored: what the API shows, plus secrets and sync state. */
export type ConnectorRecord = Connector & {
  /** Encrypted by the API before it gets here; never decrypted in this package. */
  credentials: string;
  /** Whatever the connector keeps between syncs. */
  state: Record<string, unknown>;
};

export type ConnectorChanges = Partial<
  Pick<
    ConnectorRecord,
    | 'account'
    | 'scope'
    | 'access'
    | 'status'
    | 'lastSyncAt'
    | 'failure'
    | 'credentials'
    | 'state'
  >
>;

/** How many entries a read of the audit log returns unless it asks. */
export const AUDIT_PAGE_SIZE = 200;

/** A place in the audit log, at one entry. */
export type AuditPosition = Pick<AuditEntry, 'at' | 'id'>;

export interface AuditRepository {
  /**
   * Newest first, at most `limit`. With `clientId`, also includes
   * workspace-wide entries (those with no client). Without a position, reads
   * the newest entries; `before` reads the ones just older than a position,
   * and `after` the ones just newer.
   */
  list(
    workspaceId: string,
    query?: {
      kind?: AuditKind;
      tool?: Tool;
      clientId?: string;
      before?: AuditPosition;
      after?: AuditPosition;
      limit?: number;
    },
  ): Promise<AuditEntry[]>;
  /**
   * Entries in each of AUDIT_COUNT_GROUPS, in that order, with list's
   * `clientId` filter.
   */
  counts(
    workspaceId: string,
    filter?: { clientId?: string },
  ): Promise<AuditCount[]>;
  append(workspaceId: string, entries: AuditEntry[]): Promise<void>;
  /** Deletes entries of the given kinds older than `before`. */
  prune(workspaceId: string, before: string, kinds: AuditKind[]): Promise<void>;
}

// Sign-in ---------------------------------------------------------------------
// Users and sessions aren't scoped to a workspace: signing in is what decides
// the workspace.

/** A user as stored, with their password hash. Never leaves the API. */
export type UserRecord = User & { passwordHash: string };

export type Membership = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
};

/** A signed-in session. Only a hash of its token is ever stored. */
export type SessionRecord = {
  tokenHash: string;
  userId: string;
  workspaceId: string;
  createdAt: string;
  expiresAt: string;
  /** When it was last used, to the nearest few minutes. */
  lastSeenAt: string;
};

export interface UsersRepository {
  /**
   * Creates `workspace` with `user` as its owner. False, and nothing changes,
   * when the email already belongs to an account. Atomic.
   */
  createOwner(workspace: Workspace, user: UserRecord): Promise<boolean>;
  /** Case-insensitive. */
  findByEmail(email: string): Promise<UserRecord | null>;
  get(userId: string): Promise<User | null>;
  /** Every workspace the user belongs to, by workspace ID. */
  memberships(userId: string): Promise<Membership[]>;
  setPassword(userId: string, passwordHash: string): Promise<void>;
  /** Everyone in the workspace, by name. */
  members(workspaceId: string): Promise<Member[]>;
  /** False when they aren't in the workspace. */
  setRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
  ): Promise<boolean>;
  /**
   * Takes them out of the workspace and ends their sessions there; someone
   * left in no workspace loses their account. False when they weren't in it.
   */
  removeMember(workspaceId: string, userId: string): Promise<boolean>;
}

export interface SessionsRepository {
  create(session: SessionRecord): Promise<void>;
  /** Null when there's no such session; expired ones are returned for the caller to reject. */
  find(tokenHash: string): Promise<SessionRecord | null>;
  delete(tokenHash: string): Promise<void>;
  /** Notes that the session was used at `at`. */
  touch(tokenHash: string, at: string): Promise<void>;
  /** The user's sessions, expired ones included, newest first. */
  listForUser(userId: string): Promise<SessionRecord[]>;
  /** Signs the user out everywhere, or everywhere but `except`. */
  deleteForUser(userId: string, except?: string): Promise<void>;
  /**
   * Deletes sessions that expired by `now`, or that nobody has used since
   * `unusedSince`. Returns how many went.
   */
  deleteEnded(now: string, unusedSince: string): Promise<number>;
}

/** A password reset link. Only a hash of its token is ever stored. */
export type PasswordResetRecord = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

/** An invite as stored. Only a hash of its token is ever stored. */
export type InviteRecord = Invite & {
  tokenHash: string;
  invitedByUserId: string | null;
};

export type InviteOutcome = 'accepted' | 'invalid' | 'taken';

export interface InvitesRepository {
  /** Not yet accepted, newest first. Expired ones are included. */
  list(workspaceId: string): Promise<Invite[]>;
  /** Saves an invite, replacing any to the same email in the workspace. */
  save(workspaceId: string, invite: InviteRecord): Promise<void>;
  /**
   * The invite a link's token belongs to, and its workspace. Expired ones
   * are returned for the caller to reject.
   */
  findByToken(
    tokenHash: string,
  ): Promise<(Invite & { workspaceId: string }) | null>;
  remove(workspaceId: string, id: string): Promise<boolean>;
  /**
   * Creates `user` with the invite's email, adds them to its workspace with
   * its role, and deletes it, all at once. `invalid` when the token is
   * unknown or expired by `now`; `taken` when the email has an account.
   */
  accept(
    tokenHash: string,
    user: UserRecord,
    now: string,
  ): Promise<InviteOutcome>;
}

/**
 * Meeting notes people add by hand or forward by email. Those with no client
 * wait in the inbox; removing a client puts its notes back there.
 */
export interface NotesRepository {
  /** A client's notes, or with null the inbox; newest meeting first. */
  list(workspaceId: string, clientId: string | null): Promise<MeetingNote[]>;
  get(workspaceId: string, id: string): Promise<MeetingNote | null>;
  /** Adds notes, with the source that cites them whole while they're filed. */
  add(
    workspaceId: string,
    note: MeetingNote,
    source: NoteSource | null,
  ): Promise<void>;
  /**
   * Files the notes with a client, or with null puts them back in the
   * inbox. What was cited of them and read from them is dropped, and
   * `source` cites them afresh. Null when there are no such notes.
   */
  file(
    workspaceId: string,
    id: string,
    clientId: string | null,
    source: NoteSource | null,
  ): Promise<MeetingNote | null>;
  remove(workspaceId: string, id: string): Promise<boolean>;
  /**
   * The token in the workspace's forwarding address. The first call keeps
   * `fresh`; later ones return the same token whatever they pass.
   */
  inboxToken(workspaceId: string, fresh: string, at: string): Promise<string>;
  /** The workspace a forwarding token belongs to, across all of them. */
  inboxWorkspace(token: string): Promise<string | null>;
}

/** Someone's two-factor sign-in. */
export type MfaRecord = {
  userId: string;
  /** The TOTP secret, sealed by the API; the database never sees it plain. */
  secret: string;
  /** Null while setting up. */
  enabledAt: string | null;
  /** The last 30-second step a code was used for. */
  lastStep: number | null;
  /** SHA-256 of each recovery code not yet used. */
  recoveryHashes: string[];
  createdAt: string;
};

export interface MfaRepository {
  get(userId: string): Promise<MfaRecord | null>;
  /**
   * Starts setting up with a new secret, replacing a setup not finished.
   * False, and nothing changes, when two-factor is already on.
   */
  begin(userId: string, secret: string, at: string): Promise<boolean>;
  /** Turns it on with these recovery codes; false unless a setup waits. */
  enable(
    userId: string,
    recoveryHashes: string[],
    at: string,
  ): Promise<boolean>;
  /**
   * Marks a step used, so a code works once; false when it, or a later
   * step, already was, or two-factor isn't on. Atomic.
   */
  useStep(userId: string, step: number): Promise<boolean>;
  /** Uses up a recovery code; false when it isn't one of theirs. Atomic. */
  useRecoveryCode(userId: string, hash: string): Promise<boolean>;
  remove(userId: string): Promise<void>;
}

/**
 * Attempts against rate limits, by bucket (a limit and a hashed key), across
 * every API instance. Not scoped to a workspace: sign-in comes before one.
 */
export interface RateLimitsRepository {
  /** Hits on `bucket` at or after `since`. */
  count(bucket: string, since: string): Promise<number>;
  hit(bucket: string, at: string): Promise<void>;
  /** Forgets a bucket, e.g. an email's failures once its sign-in works. */
  clear(bucket: string): Promise<void>;
  /** Deletes every hit before `before`. */
  prune(before: string): Promise<void>;
}

export interface PasswordResetsRepository {
  /** Saves a reset, and drops any unused one the user had. */
  create(reset: PasswordResetRecord): Promise<void>;
  /**
   * Marks the reset used and returns its user, or null when it doesn't
   * exist, was used, or expired by `now`. Works once, even when two
   * requests race for it.
   */
  consume(tokenHash: string, now: string): Promise<string | null>;
}

// Events and notifications ------------------------------------------------------

/** An event to record. The API checks `type` and `payload`; this package doesn't. */
export type NewEventRecord = {
  id: string;
  type: string;
  /** Null when Dossier did it. */
  actorUserId: string | null;
  payload: Record<string, unknown>;
  /** Events with the same key in a workspace are recorded once. */
  dedupeKey: string | null;
  occurredAt: string;
};

/** A recorded event, as a dispatcher claims it. */
export type EventRecord = NewEventRecord & {
  workspaceId: string;
  /** Tries so far, this claim included. */
  attempts: number;
};

/**
 * The outbox: events wait here until a dispatcher has handed them to every
 * subscriber, so none is lost when the API stops part way.
 */
export interface EventsRepository {
  /** False, and nothing changes, when its dedupe key was already used. */
  append(workspaceId: string, event: NewEventRecord): Promise<boolean>;
  /**
   * Up to `limit` events due by `now` from every workspace, oldest first,
   * held until `until` so no one else claims them; counts the attempt.
   * Crosses workspaces.
   */
  claim(now: string, until: string, limit: number): Promise<EventRecord[]>;
  /** Every subscriber has handled it. */
  markDispatched(workspaceId: string, id: string, at: string): Promise<void>;
  /** Lets it go, to be claimed again from `nextAttemptAt`. */
  retry(
    workspaceId: string,
    id: string,
    nextAttemptAt: string,
    error: string,
  ): Promise<void>;
  /** Gives up on it. */
  markFailed(
    workspaceId: string,
    id: string,
    at: string,
    error: string,
  ): Promise<void>;
  /** Deletes dispatched and failed events that happened before `before`. */
  prune(workspaceId: string, before: string): Promise<void>;
}

/** A notification as stored: for one person, from one event. */
export type NotificationRecord = {
  id: string;
  eventId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
  /** In their feed; false when they only wanted it by email. */
  inApp: boolean;
  /** Whether to email it. */
  email: boolean;
  emailSentAt: string | null;
};

/** A place in someone's feed, at one notification. */
export type NotificationPosition = { at: string; id: string };

/**
 * Notifications, and what each person wants to hear about. Preferences live
 * with their membership, so they go when the person leaves.
 */
export interface NotificationsRepository {
  /** Skips any for an event and person it already has. */
  add(workspaceId: string, notifications: NotificationRecord[]): Promise<void>;
  /** What an event became, for everyone it went to. */
  forEvent(workspaceId: string, eventId: string): Promise<NotificationRecord[]>;
  /** Someone's feed, newest first: only `inApp` ones. */
  list(
    workspaceId: string,
    userId: string,
    query?: {
      before?: NotificationPosition;
      unread?: boolean;
      limit?: number;
    },
  ): Promise<NotificationRecord[]>;
  countUnread(workspaceId: string, userId: string): Promise<number>;
  /** Marks theirs read, by ID or all of them; returns how many changed. */
  markRead(
    workspaceId: string,
    userId: string,
    ids: string[] | 'all',
    at: string,
  ): Promise<number>;
  /**
   * Takes on emailing one, so it goes once. False when it's sent, not to be
   * emailed, or claimed since `staleBefore`.
   */
  claimEmail(
    workspaceId: string,
    id: string,
    at: string,
    staleBefore: string,
  ): Promise<boolean>;
  markEmailed(workspaceId: string, id: string, at: string): Promise<void>;
  /** Gives up a claim after a send that failed, so a retry can take it. */
  releaseEmail(workspaceId: string, id: string): Promise<void>;
  /** Deletes notifications made before `before`. */
  prune(workspaceId: string, before: string): Promise<void>;
  /** Each member's saved preferences, by user ID; only those who saved any. */
  preferences(workspaceId: string): Promise<Record<string, unknown>>;
  /** False when they aren't in the workspace. */
  setPreferences(
    workspaceId: string,
    userId: string,
    preferences: Record<string, unknown>,
  ): Promise<boolean>;
}

export interface DatabaseAdapter {
  readonly provider: DatabaseProvider;
  readonly users: UsersRepository;
  readonly sessions: SessionsRepository;
  readonly passwordResets: PasswordResetsRepository;
  readonly invites: InvitesRepository;
  readonly rateLimits: RateLimitsRepository;
  readonly mfa: MfaRepository;
  readonly notes: NotesRepository;
  readonly workspaces: WorkspacesRepository;
  readonly clients: ClientsRepository;
  readonly attention: AttentionRepository;
  readonly recommendations: RecommendationsRepository;
  readonly commitments: CommitmentsRepository;
  readonly meetings: MeetingsRepository;
  readonly meetingPoints: MeetingPointsRepository;
  readonly devices: DevicesRepository;
  readonly tickets: TicketsRepository;
  readonly reports: ReportsRepository;
  readonly sources: SourcesRepository;
  readonly records: RecordsRepository;
  readonly connectors: ConnectorsRepository;
  readonly audit: AuditRepository;
  readonly intelligence: IntelligenceRepository;
  readonly ask: AskRepository;
  readonly patterns: PatternsRepository;
  readonly reportQuestions: ReportQuestionsRepository;
  readonly reportSettings: ReportSettingsRepository;
  readonly recipients: RecipientsRepository;
  readonly deliveries: DeliveriesRepository;
  readonly contractDocuments: ContractDocumentsRepository;
  readonly events: EventsRepository;
  readonly notifications: NotificationsRepository;
  /** Resolves when the database is reachable and migrated; rejects otherwise. */
  ping(): Promise<void>;
  /** Releases connections. The adapter must not be used afterwards. */
  close(): Promise<void>;
}
