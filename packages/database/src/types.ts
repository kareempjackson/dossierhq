import type {
  AttentionItem,
  AuditEntry,
  Client,
  ClientListItem,
  Commitment,
  Connector,
  Device,
  Meeting,
  Recommendation,
  RecommendationStatus,
  Report,
  ReportStatus,
  ReportSummary,
  Source,
  Tool,
  User,
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
  /** Null when there's no such recommendation. */
  update(
    workspaceId: string,
    id: string,
    changes: RecommendationChanges,
  ): Promise<Recommendation | null>;
}

export interface CommitmentsRepository {
  /** Open first (soonest due first), then done (most recent first). */
  list(
    workspaceId: string,
    filter?: { clientId?: string },
  ): Promise<Commitment[]>;
}

export interface MeetingsRepository {
  /** Newest first. */
  list(workspaceId: string, filter?: { clientId?: string }): Promise<Meeting[]>;
}

export interface DevicesRepository {
  /** Failed patching first, then pending, then the rest; each by name. */
  list(workspaceId: string, filter?: { clientId?: string }): Promise<Device[]>;
}

export interface ReportsRepository {
  /** Without bodies. Newest week first, then by client name. */
  listSummaries(
    workspaceId: string,
    filter?: { clientId?: string; status?: ReportStatus },
  ): Promise<ReportSummary[]>;
  get(workspaceId: string, id: string): Promise<Report | null>;
  /**
   * Sets the status of each report. `approvedAt` becomes `at` when approving
   * and null otherwise. Returns the updated summaries in the order given;
   * unknown IDs are skipped.
   */
  setStatus(
    workspaceId: string,
    ids: string[],
    status: ReportStatus,
    at: string,
  ): Promise<ReportSummary[]>;
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

/** The audit log is capped per read; older entries need paging, added later. */
export const AUDIT_PAGE_SIZE = 200;

export interface AuditRepository {
  /**
   * Newest first, at most AUDIT_PAGE_SIZE. With `clientId`, also includes
   * workspace-wide reads (those with no client).
   */
  list(
    workspaceId: string,
    filter?: { tool?: Tool; clientId?: string },
  ): Promise<AuditEntry[]>;
  append(workspaceId: string, entries: AuditEntry[]): Promise<void>;
  /** Deletes entries older than `before`. */
  prune(workspaceId: string, before: string): Promise<void>;
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
}

export interface SessionsRepository {
  create(session: SessionRecord): Promise<void>;
  /** Null when there's no such session; expired ones are returned for the caller to reject. */
  find(tokenHash: string): Promise<SessionRecord | null>;
  delete(tokenHash: string): Promise<void>;
}

export interface DatabaseAdapter {
  readonly provider: DatabaseProvider;
  readonly users: UsersRepository;
  readonly sessions: SessionsRepository;
  readonly workspaces: WorkspacesRepository;
  readonly clients: ClientsRepository;
  readonly attention: AttentionRepository;
  readonly recommendations: RecommendationsRepository;
  readonly commitments: CommitmentsRepository;
  readonly meetings: MeetingsRepository;
  readonly devices: DevicesRepository;
  readonly reports: ReportsRepository;
  readonly sources: SourcesRepository;
  readonly records: RecordsRepository;
  readonly connectors: ConnectorsRepository;
  readonly audit: AuditRepository;
  /** Resolves when the database is reachable and migrated; rejects otherwise. */
  ping(): Promise<void>;
  /** Releases connections. The adapter must not be used afterwards. */
  close(): Promise<void>;
}
