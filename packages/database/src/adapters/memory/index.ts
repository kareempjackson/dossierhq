import type { ClientListItem, Report } from '@dossierhq/contracts';
import type { Dataset } from '@dossierhq/fixtures';
import {
  byAttention,
  byAuditRecency,
  byCommitment,
  byDevice,
  byMeeting,
  byName,
  byOverview,
  byRecommendation,
  byReportWeek,
  bySourceRecency,
  byTool,
  compareText,
  inIdOrder,
  toSummary,
} from '../../ordering.js';
import { AUDIT_PAGE_SIZE, type DatabaseAdapter } from '../../types.js';

/**
 * Keeps everything in process memory, seeded from a dataset (the demo
 * workspace in the API by default, empty otherwise). Handy for tests and for
 * running the API with no database. Changes are lost on restart.
 */
export function createMemoryAdapter(seed?: Dataset): DatabaseAdapter {
  // A private copy, so writes never leak into the shared fixture.
  const data: Dataset = seed ? structuredClone(seed) : emptyDataset();
  const inWorkspace = (workspaceId: string) =>
    data.workspace.id === workspaceId;
  const clientName = (id: string) =>
    data.clients.find((client) => client.id === id)?.name ?? id;
  const forClient =
    (clientId?: string) =>
    (item: { clientId: string | null }): boolean =>
      clientId === undefined || item.clientId === clientId;

  const summaries = (workspaceId: string, reports: Report[]) =>
    inWorkspace(workspaceId)
      ? reports.map(toSummary).sort(byReportWeek(clientName))
      : [];

  return {
    provider: 'memory',

    workspaces: {
      async get(workspaceId) {
        return inWorkspace(workspaceId)
          ? structuredClone(data.workspace)
          : null;
      },
    },

    clients: {
      async list(workspaceId) {
        return inWorkspace(workspaceId) ? [...data.clients].sort(byName) : [];
      },
      async get(workspaceId, clientId) {
        if (!inWorkspace(workspaceId)) return null;
        return data.clients.find((client) => client.id === clientId) ?? null;
      },
      async overview(workspaceId) {
        if (!inWorkspace(workspaceId)) return [];
        return data.clients
          .map((client): ClientListItem => {
            const items = data.attentionItems.filter(
              (item) => item.clientId === client.id,
            );
            const latest = data.reports
              .filter((report) => report.clientId === client.id)
              .sort((a, b) => compareText(b.weekStart, a.weekStart))[0];
            const lastMeeting = data.meetings
              .filter((meeting) => meeting.clientId === client.id)
              .map((meeting) => meeting.occurredAt)
              .sort(compareText)
              .at(-1);
            return {
              client,
              attention: {
                total: items.length,
                critical: items.filter((i) => i.urgency === 'critical').length,
                high: items.filter((i) => i.urgency === 'high').length,
              },
              lastMeetingAt: lastMeeting ?? null,
              latestReport: latest ? toSummary(latest) : null,
            };
          })
          .sort(byOverview);
      },
      async recent(workspaceId, limit) {
        if (!inWorkspace(workspaceId)) return [];
        return [...data.clientViews]
          .sort((a, b) => compareText(b.viewedAt, a.viewedAt))
          .slice(0, limit)
          .flatMap(
            (view) => data.clients.find((c) => c.id === view.clientId) ?? [],
          );
      },
      async recordView(workspaceId, clientId, at) {
        if (!inWorkspace(workspaceId)) return false;
        if (!data.clients.some((client) => client.id === clientId))
          return false;
        data.clientViews = [
          { clientId, viewedAt: at },
          ...data.clientViews.filter((view) => view.clientId !== clientId),
        ];
        return true;
      },
    },

    attention: {
      async list(workspaceId, { clientId } = {}) {
        if (!inWorkspace(workspaceId)) return [];
        return data.attentionItems
          .filter(forClient(clientId))
          .sort(byAttention);
      },
    },

    recommendations: {
      async list(workspaceId, { clientId, status } = {}) {
        if (!inWorkspace(workspaceId)) return [];
        return data.recommendations
          .filter(forClient(clientId))
          .filter((rec) => status === undefined || rec.status === status)
          .sort(byRecommendation);
      },
      async get(workspaceId, id) {
        if (!inWorkspace(workspaceId)) return null;
        return data.recommendations.find((rec) => rec.id === id) ?? null;
      },
      async update(workspaceId, id, changes) {
        if (!inWorkspace(workspaceId)) return null;
        const index = data.recommendations.findIndex((rec) => rec.id === id);
        const current = data.recommendations[index];
        if (!current) return null;
        const updated = {
          ...current,
          ...Object.fromEntries(
            Object.entries(changes).filter(([, value]) => value !== undefined),
          ),
        };
        data.recommendations[index] = updated;
        return updated;
      },
    },

    commitments: {
      async list(workspaceId, { clientId } = {}) {
        if (!inWorkspace(workspaceId)) return [];
        return data.commitments.filter(forClient(clientId)).sort(byCommitment);
      },
    },

    meetings: {
      async list(workspaceId, { clientId } = {}) {
        if (!inWorkspace(workspaceId)) return [];
        return data.meetings.filter(forClient(clientId)).sort(byMeeting);
      },
    },

    devices: {
      async list(workspaceId, { clientId } = {}) {
        if (!inWorkspace(workspaceId)) return [];
        return data.devices.filter(forClient(clientId)).sort(byDevice);
      },
    },

    reports: {
      async listSummaries(workspaceId, { clientId, status } = {}) {
        return summaries(
          workspaceId,
          data.reports
            .filter(forClient(clientId))
            .filter(
              (report) => status === undefined || report.status === status,
            ),
        );
      },
      async get(workspaceId, id) {
        if (!inWorkspace(workspaceId)) return null;
        return data.reports.find((report) => report.id === id) ?? null;
      },
      async setStatus(workspaceId, ids, status, at) {
        if (!inWorkspace(workspaceId)) return [];
        const wanted = new Set(ids);
        data.reports = data.reports.map((report) =>
          wanted.has(report.id)
            ? {
                ...report,
                status,
                approvedAt: status === 'approved' ? at : null,
              }
            : report,
        );
        return inIdOrder(
          ids,
          data.reports.filter((report) => wanted.has(report.id)).map(toSummary),
        );
      },
    },

    sources: {
      async getMany(workspaceId, ids) {
        if (!inWorkspace(workspaceId)) return [];
        const wanted = new Set(ids);
        return inIdOrder(
          ids,
          data.sources.filter((source) => wanted.has(source.id)),
        );
      },
      async listForClient(workspaceId, clientId) {
        if (!inWorkspace(workspaceId)) return [];
        return data.sources
          .filter((source) => source.clientId === clientId)
          .sort(bySourceRecency);
      },
    },

    connectors: {
      async list(workspaceId) {
        return inWorkspace(workspaceId)
          ? [...data.connectors].sort(byTool)
          : [];
      },
    },

    audit: {
      async list(workspaceId, { tool, clientId } = {}) {
        if (!inWorkspace(workspaceId)) return [];
        return data.auditLog
          .filter((entry) => tool === undefined || entry.tool === tool)
          .filter(
            (entry) =>
              clientId === undefined ||
              entry.clientId === clientId ||
              entry.clientId === null,
          )
          .sort(byAuditRecency)
          .slice(0, AUDIT_PAGE_SIZE);
      },
    },

    ping: async () => {},
    close: async () => {},
  };
}

function emptyDataset(): Dataset {
  return {
    workspace: {
      id: '',
      name: '',
      user: { name: '', role: '' },
      timeZone: 'UTC',
    },
    clients: [],
    clientViews: [],
    sources: [],
    attentionItems: [],
    recommendations: [],
    commitments: [],
    meetings: [],
    devices: [],
    reports: [],
    connectors: [],
    auditLog: [],
  };
}
