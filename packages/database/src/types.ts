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
  Workspace,
} from '@dossierhq/contracts';
import type { DatabaseProvider } from './config.js';

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
  /** NinjaOne, Hudu, SharePoint, Fathom. */
  list(workspaceId: string): Promise<Connector[]>;
}

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
}

export interface DatabaseAdapter {
  readonly provider: DatabaseProvider;
  readonly workspaces: WorkspacesRepository;
  readonly clients: ClientsRepository;
  readonly attention: AttentionRepository;
  readonly recommendations: RecommendationsRepository;
  readonly commitments: CommitmentsRepository;
  readonly meetings: MeetingsRepository;
  readonly devices: DevicesRepository;
  readonly reports: ReportsRepository;
  readonly sources: SourcesRepository;
  readonly connectors: ConnectorsRepository;
  readonly audit: AuditRepository;
  /** Resolves when the database is reachable and migrated; rejects otherwise. */
  ping(): Promise<void>;
  /** Releases connections. The adapter must not be used afterwards. */
  close(): Promise<void>;
}
