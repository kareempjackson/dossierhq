import 'server-only';
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
  Report,
  ReportSummary,
  Source,
  Tool,
  Urgency,
  Workspace,
} from '@dossierhq/contracts';
import * as mock from './mock';

/**
 * The web app's only way to read Dossier data. Every function is async and
 * returns contract types, so moving from mock data to the real API changes the
 * bodies here and nothing in the pages.
 *
 * Set MOCK_SCENARIO in apps/web/.env.local to preview list states in dev:
 *   empty  every list comes back empty
 *   error  every list read fails
 *   slow   every read waits 1.5s, so loading states show
 */
const scenario = process.env.MOCK_SCENARIO;

async function serve<T>(data: T, empty: T): Promise<T> {
  if (scenario === 'slow') await new Promise((r) => setTimeout(r, 1500));
  if (scenario === 'error') throw new Error('MOCK_SCENARIO=error');
  return scenario === 'empty' ? empty : data;
}

const byClientName = (a: { clientId: string }, b: { clientId: string }) =>
  clientName(a.clientId).localeCompare(clientName(b.clientId));
const clientName = (id: string) =>
  mock.clients.find((client) => client.id === id)?.name ?? id;

// Workspace and clients -----------------------------------------------------

/** The moment the data describes. Use it instead of `Date.now()`. */
export async function getNow(): Promise<string> {
  return mock.NOW;
}

export async function getWorkspace(): Promise<Workspace> {
  return mock.workspace;
}

export async function getClients(): Promise<Client[]> {
  return serve(mock.clients, []);
}

export async function getClient(id: string): Promise<Client | null> {
  return serve(mock.clients.find((client) => client.id === id) ?? null, null);
}

/** Most recently opened first. */
export async function getRecentClients(limit = 5): Promise<Client[]> {
  const recent = mock.recentClientIds
    .slice(0, limit)
    .flatMap((id) => mock.clients.find((client) => client.id === id) ?? []);
  return serve(recent, []);
}

/** Every client with what's current there. Most urgent first, then by name. */
export async function getClientList(): Promise<ClientListItem[]> {
  const items = mock.clients.map((client): ClientListItem => {
    const attention = mock.attentionItems.filter(
      (item) => item.clientId === client.id,
    );
    const latestReport = mock.reports
      .filter((report) => report.clientId === client.id)
      .toSorted((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
    return {
      client,
      attention: {
        total: attention.length,
        critical: attention.filter((i) => i.urgency === 'critical').length,
        high: attention.filter((i) => i.urgency === 'high').length,
      },
      lastMeetingAt:
        mock.meetings.find((meeting) => meeting.clientId === client.id)
          ?.occurredAt ?? null,
      latestReport: latestReport ? toSummary(latestReport) : null,
    };
  });
  return serve(
    items.toSorted(
      (a, b) =>
        b.attention.critical - a.attention.critical ||
        b.attention.high - a.attention.high ||
        b.attention.total - a.attention.total ||
        a.client.name.localeCompare(b.client.name),
    ),
    [],
  );
}

// Attention, recommendations, commitments -----------------------------------

const urgencyRank: Record<Urgency, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

/** Most urgent first, then newest first. */
export async function getAttentionItems({
  clientId,
}: { clientId?: string } = {}): Promise<AttentionItem[]> {
  const items = mock.attentionItems
    .filter((item) => clientId === undefined || item.clientId === clientId)
    .toSorted(
      (a, b) =>
        urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
        b.raisedAt.localeCompare(a.raisedAt),
    );
  return serve(items, []);
}

/** Newest first. */
export async function getRecommendations({
  clientId,
  status,
}: {
  clientId?: string;
  status?: Recommendation['status'];
} = {}): Promise<Recommendation[]> {
  const items = mock.recommendations
    .filter((rec) => clientId === undefined || rec.clientId === clientId)
    .filter((rec) => status === undefined || rec.status === status)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  return serve(items, []);
}

/** Open first (soonest due first), then done (most recent first). */
export async function getCommitments({
  clientId,
}: { clientId?: string } = {}): Promise<Commitment[]> {
  const items = mock.commitments
    .filter((c) => clientId === undefined || c.clientId === clientId)
    .toSorted((a, b) =>
      a.status !== b.status
        ? a.status === 'open'
          ? -1
          : 1
        : a.status === 'open'
          ? (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999')
          : (b.completedAt ?? '').localeCompare(a.completedAt ?? ''),
    );
  return serve(items, []);
}

// Meetings and devices ------------------------------------------------------

/** Newest first. */
export async function getMeetings({
  clientId,
}: { clientId?: string } = {}): Promise<Meeting[]> {
  return serve(
    mock.meetings.filter(
      (meeting) => clientId === undefined || meeting.clientId === clientId,
    ),
    [],
  );
}

const patchRank: Record<Device['patchStatus'], number> = {
  failed: 0,
  pending: 1,
  current: 2,
};

/** Devices needing work first, then by name. */
export async function getDevices({
  clientId,
}: { clientId?: string } = {}): Promise<Device[]> {
  return serve(
    mock.devices
      .filter(
        (device) => clientId === undefined || device.clientId === clientId,
      )
      .toSorted(
        (a, b) =>
          patchRank[a.patchStatus] - patchRank[b.patchStatus] ||
          a.name.localeCompare(b.name),
      ),
    [],
  );
}

// Reports -------------------------------------------------------------------

function toSummary(report: Report): ReportSummary {
  const { id, clientId, weekStart, weekEnd, status, generatedAt } = report;
  const { exceptions, approvedAt } = report;
  return {
    id,
    clientId,
    weekStart,
    weekEnd,
    status,
    generatedAt,
    exceptions,
    approvedAt,
  };
}

/** Newest week first; within a week, by client name. */
export async function getReportSummaries({
  clientId,
  status,
}: {
  clientId?: string;
  status?: ReportSummary['status'];
} = {}): Promise<ReportSummary[]> {
  const items = mock.reports
    .filter((report) => clientId === undefined || report.clientId === clientId)
    .filter((report) => status === undefined || report.status === status)
    .toSorted(
      (a, b) => b.weekStart.localeCompare(a.weekStart) || byClientName(a, b),
    )
    .map(toSummary);
  return serve(items, []);
}

export async function getReportSummary(
  id: string,
): Promise<ReportSummary | null> {
  const report = mock.reports.find((r) => r.id === id);
  return serve(report ? toSummary(report) : null, null);
}

export async function getReport(id: string): Promise<Report | null> {
  return serve(mock.reports.find((report) => report.id === id) ?? null, null);
}

/** Drafts waiting for review: exceptions first, then clean, each by name. */
export async function getReviewQueue(): Promise<ReportSummary[]> {
  const drafts = mock.reports
    .filter((report) => report.status === 'draft')
    .map(toSummary);
  const withExceptions = drafts.filter((r) => r.exceptions.length > 0);
  const clean = drafts.filter((r) => r.exceptions.length === 0);
  return serve(
    [...withExceptions.toSorted(byClientName), ...clean.toSorted(byClientName)],
    [],
  );
}

/** ISO week number of a report week, e.g. 41. */
export async function getWeekNumber(weekStart: string): Promise<number | null> {
  return mock.weekNumber(weekStart);
}

// Sources and connections ---------------------------------------------------

/** The sources with these IDs, in the same order. Unknown IDs are skipped. */
export async function getSources(ids: string[]): Promise<Source[]> {
  return serve(
    ids.flatMap((id) => mock.findSource(id) ?? []),
    [],
  );
}

/** Everything Dossier has read about a client, newest first. */
export async function getClientSources(clientId: string): Promise<Source[]> {
  return serve(
    mock
      .sourcesForClient(clientId)
      .toSorted((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [],
  );
}

export async function getConnectors(): Promise<Connector[]> {
  return serve(mock.connectors, []);
}

/** Newest first. */
export async function getAuditLog({
  tool,
  clientId,
}: { tool?: Tool; clientId?: string } = {}): Promise<AuditEntry[]> {
  return serve(
    mock.auditLog
      .filter((entry) => tool === undefined || entry.tool === tool)
      .filter(
        (entry) =>
          clientId === undefined ||
          entry.clientId === clientId ||
          entry.clientId === null,
      ),
    [],
  );
}
