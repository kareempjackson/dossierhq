import type {
  ConnectorCredentials,
  CredentialsFor,
  Tool,
  UnattachedMeeting,
} from '@dossierhq/contracts';
import type { ToolRecords } from '@dossierhq/database';
import type { ToolHttp } from './http.js';

/** An organisation as one tool knows it: a NinjaOne organization, a Hudu company. */
export type ExternalOrg = {
  externalId: string;
  name: string;
  /** Deep link to it in the tool. */
  url: string;
  /** Web and email domains the tool knows for it. */
  domains: string[];
  location: string | null;
};

/** What a connector gets while it syncs. */
export interface SyncContext {
  readonly workspaceId: string;
  /** Real time, never the pinned demo clock. */
  readonly now: Date;
  readonly http: ToolHttp;
  /** A stable record ID, unique across workspaces and tools. */
  id(kind: string, ...parts: (string | number)[]): string;
  /** Notes a read for the audit log. */
  audit(read: string, recordCount: number, clientId?: string | null): void;
}

/** Finds the Dossier client a tool's record belongs to. */
export interface ClientLookup {
  /** By this tool's own organisation ID. */
  forOrg(externalId: string): string | null;
  /** By email or web domain, e.g. a meeting invitee's. */
  forDomains(domains: string[]): string | null;
  /** The client someone attached this record to by hand, by its Dossier ID. */
  attached(recordId: string): string | null;
  name(clientId: string): string;
}

export type ToolRead = ToolRecords & {
  /** What the connector covers, e.g. "RMM · 14 organisations · 612 devices". */
  scope: string;
  /** Meetings no client matched, for someone to attach by hand. */
  unattached?: UnattachedMeeting[];
};

/** A signed-in connection to one tool account, for one sync. */
export interface ToolSession {
  /** Which account this is, e.g. "eu.ninjarmm.com". */
  readonly account: string;
  /**
   * Credentials to store from now on, when signing in changed them: NinjaOne
   * can hand out a new refresh token each time it's used.
   */
  readonly credentials?: ConnectorCredentials;
  organizations(): Promise<ExternalOrg[]>;
  read(clients: ClientLookup): Promise<ToolRead>;
}

/**
 * One integration. Read-only: connectors only ever GET from a tool, and POST
 * only to sign in or to run a search the tool offers as a POST (NinjaOne's
 * ticket boards). Every record they return is tagged with their tool, so a
 * sync replaces exactly what the last one wrote.
 */
export interface ToolConnector<T extends Tool = Tool> {
  readonly tool: T;
  /** What Dossier reads, e.g. "read: organizations, devices, alerts". */
  readonly access: string;
  /**
   * Whether this tool's organisations become clients. Otherwise its records
   * only attach to clients other tools brought in.
   */
  readonly createsClients: boolean;
  /** Where to open the account, for links when a sync fails. */
  home(credentials: CredentialsFor<T>): string;
  /** Signs in and makes one small read, so bad credentials fail here. */
  open(credentials: CredentialsFor<T>, ctx: SyncContext): Promise<ToolSession>;
}
