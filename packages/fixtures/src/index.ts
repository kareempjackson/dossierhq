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
  Source,
  Ticket,
  User,
  Workspace,
  WorkspaceRole,
} from '@dossierhq/contracts';
import { auditLog, connectors } from './connectors.js';
import { deviceSource, devices } from './devices.js';
import { attentionItems, commitments, recommendations } from './insights.js';
import { meetingSources, meetings, recordingSources } from './meetings.js';
import { reportSources, reports } from './reports.js';
import { keySources } from './sources.js';
import { ticketSources, tickets } from './tickets.js';
import {
  clients,
  memberships,
  NOW,
  recentClientIds,
  users,
  workspace,
} from './world.js';

export { DEMO_EMAIL, DEMO_PASSWORD } from './world.js';

/** Everything one workspace holds. The shape every adapter can be seeded with. */
export interface Dataset {
  workspace: Workspace;
  /** People who can sign in, with their password hashes. */
  users: (User & { passwordHash: string })[];
  memberships: { workspaceId: string; userId: string; role: WorkspaceRole }[];
  clients: Client[];
  /** When the user last opened each client, most recent first. */
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

/** The moment the demo data describes: Friday 9 Oct 2026, 16:40 in London. */
export const DEMO_NOW = NOW;

/**
 * The fictional Larkspur IT workspace the tests run against. Never loaded into
 * a running Dossier. Treat as read-only; clone before mutating.
 */
export const demo: Dataset = {
  workspace,
  users,
  memberships,
  clients,
  clientViews: recentClientIds.map((clientId, index) => ({
    clientId,
    viewedAt: new Date(
      new Date(NOW).getTime() - (index + 1) * 7 * 60_000,
    ).toISOString(),
  })),
  sources: [
    ...keySources,
    ...meetingSources,
    ...recordingSources,
    ...reportSources,
    ...devices.flatMap((device) =>
      keySources.some((source) => source.id === device.sourceId)
        ? []
        : [deviceSource(device)],
    ),
    ...ticketSources,
  ],
  attentionItems,
  recommendations,
  commitments,
  meetings,
  devices,
  tickets,
  reports,
  connectors,
  auditLog,
};

export { toInsertSql } from './sql.js';
