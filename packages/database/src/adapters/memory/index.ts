import type {
  AttentionItem,
  AuditEntry,
  Client,
  ClientListItem,
  Commitment,
  Device,
  Meeting,
  Recommendation,
  Report,
  Source,
  Tool,
  Workspace,
} from '@dossierhq/contracts';
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
import {
  AUDIT_PAGE_SIZE,
  type ClientLink,
  type ConnectorRecord,
  type DatabaseAdapter,
  type Dataset,
  type Membership,
  type SessionRecord,
  type ToolRecords,
  type UserRecord,
} from '../../types.js';

/** One workspace's data. Records a sync wrote carry the tool in `origin`. */
type Store = {
  workspace: Workspace;
  clients: Client[];
  clientViews: { clientId: string; viewedAt: string }[];
  links: ClientLink[];
  sources: Source[];
  attentionItems: AttentionItem[];
  recommendations: Recommendation[];
  commitments: Commitment[];
  meetings: Meeting[];
  devices: Device[];
  reports: Report[];
  connectors: ConnectorRecord[];
  auditLog: AuditEntry[];
  /** Which tool wrote each synced record, keyed `table:id`. */
  origin: Map<string, Tool>;
};

const emptyStore = (workspace: Workspace): Store => ({
  workspace,
  clients: [],
  clientViews: [],
  links: [],
  sources: [],
  attentionItems: [],
  recommendations: [],
  commitments: [],
  meetings: [],
  devices: [],
  reports: [],
  connectors: [],
  auditLog: [],
  origin: new Map(),
});

/**
 * Keeps everything in process memory, optionally starting from a dataset (the
 * tests use the demo workspace). Handy for tests and for running the API with
 * no database. Changes are lost on restart.
 */
export function createMemoryAdapter(seed?: Dataset): DatabaseAdapter {
  // Private copies, so writes never leak into a shared fixture.
  const initial = seed ? structuredClone(seed) : undefined;
  const stores = new Map<string, Store>();
  const users: UserRecord[] = initial?.users ?? [];
  const memberships: Membership[] = initial?.memberships ?? [];
  const sessions = new Map<string, SessionRecord>();

  if (initial) {
    stores.set(initial.workspace.id, {
      ...emptyStore(initial.workspace),
      clients: initial.clients,
      clientViews: initial.clientViews,
      sources: initial.sources,
      attentionItems: initial.attentionItems,
      recommendations: initial.recommendations,
      commitments: initial.commitments,
      meetings: initial.meetings,
      devices: initial.devices,
      reports: initial.reports,
      connectors: initial.connectors.map((connector) => ({
        ...connector,
        credentials: '',
        state: {},
      })),
      auditLog: initial.auditLog,
    });
  }

  const forClient =
    (clientId?: string) =>
    (item: { clientId: string | null }): boolean =>
      clientId === undefined || item.clientId === clientId;
  const clientNameIn = (store: Store) => (id: string) =>
    store.clients.find((client) => client.id === id)?.name ?? id;
  const publicConnector = ({
    credentials: _credentials,
    state: _state,
    ...connector
  }: ConnectorRecord) => connector;

  /** Runs `read` on the workspace's store, or returns `fallback` if there is none. */
  function inStore<T>(
    workspaceId: string,
    fallback: T,
    read: (store: Store) => T,
  ): Promise<T> {
    const store = stores.get(workspaceId);
    return Promise.resolve(store ? structuredClone(read(store)) : fallback);
  }

  /** Drops a tool's records of one kind, keeping everything else. */
  function withoutTool<T extends { id: string }>(
    store: Store,
    table: string,
    tool: Tool,
    items: T[],
  ): T[] {
    return items.filter((item) => {
      const key = `${table}:${item.id}`;
      if (store.origin.get(key) !== tool) return true;
      store.origin.delete(key);
      return false;
    });
  }

  function tagged<T extends { id: string }>(
    store: Store,
    table: string,
    tool: Tool,
    items: T[],
  ): T[] {
    for (const item of items) store.origin.set(`${table}:${item.id}`, tool);
    return structuredClone(items);
  }

  function syncClients(
    store: Store,
    tool: Tool,
    clients: Client[],
    links: ClientLink[],
  ) {
    const previouslyLinked = new Set(
      store.links.filter((l) => l.tool === tool).map((l) => l.clientId),
    );
    for (const client of structuredClone(clients)) {
      const index = store.clients.findIndex((c) => c.id === client.id);
      if (index === -1) store.clients.push(client);
      else {
        // A sync never overwrites the contract; the tools don't know it.
        store.clients[index] = {
          ...client,
          contract: store.clients[index]!.contract,
        };
      }
    }
    store.links = [
      ...store.links.filter((l) => l.tool !== tool),
      ...structuredClone(links),
    ];
    const orphaned = new Set(
      [...previouslyLinked].filter(
        (id) => !store.links.some((l) => l.clientId === id),
      ),
    );
    if (orphaned.size > 0) removeClients(store, orphaned);
  }

  /** Deletes clients and everything that hangs off them, like ON DELETE CASCADE. */
  function removeClients(store: Store, ids: Set<string>) {
    const keep = (item: { clientId: string | null }) =>
      item.clientId === null || !ids.has(item.clientId);
    store.clients = store.clients.filter((c) => !ids.has(c.id));
    store.clientViews = store.clientViews.filter(keep);
    store.links = store.links.filter(keep);
    store.sources = store.sources.filter(keep);
    store.attentionItems = store.attentionItems.filter(keep);
    store.recommendations = store.recommendations.filter(keep);
    store.commitments = store.commitments.filter(keep);
    store.meetings = store.meetings.filter(keep);
    store.devices = store.devices.filter(keep);
    store.reports = store.reports.filter(keep);
    store.auditLog = store.auditLog.filter(keep);
  }

  function replaceRecords(store: Store, tool: Tool, records: ToolRecords) {
    store.attentionItems = [
      ...withoutTool(store, 'attention', tool, store.attentionItems),
      ...tagged(store, 'attention', tool, records.attention),
    ];
    store.commitments = [
      ...withoutTool(store, 'commitment', tool, store.commitments),
      ...tagged(store, 'commitment', tool, records.commitments),
    ];
    store.devices = [
      ...withoutTool(store, 'device', tool, store.devices),
      ...tagged(store, 'device', tool, records.devices),
    ];
    store.meetings = [
      ...withoutTool(store, 'meeting', tool, store.meetings),
      ...tagged(store, 'meeting', tool, records.meetings),
    ];
    store.sources = [
      ...store.sources.filter((source) => source.tool !== tool),
      ...structuredClone(records.sources),
    ];
  }

  return {
    provider: 'memory',

    users: {
      async any() {
        return users.length > 0;
      },
      async createFirstOwner(workspace, user) {
        if (users.length > 0) return false;
        stores.set(workspace.id, emptyStore(structuredClone(workspace)));
        users.push({ ...user, email: user.email.toLowerCase() });
        memberships.push({
          workspaceId: workspace.id,
          userId: user.id,
          role: 'owner',
        });
        return true;
      },
      async findByEmail(email) {
        const wanted = email.toLowerCase();
        const user = users.find((u) => u.email === wanted);
        return user ? { ...user } : null;
      },
      async get(userId) {
        const user = users.find((u) => u.id === userId);
        if (!user) return null;
        const { passwordHash: _hash, ...rest } = user;
        return rest;
      },
      async memberships(userId) {
        return memberships
          .filter((m) => m.userId === userId)
          .sort((a, b) => compareText(a.workspaceId, b.workspaceId))
          .map((m) => ({ ...m }));
      },
    },

    sessions: {
      async create(session) {
        sessions.set(session.tokenHash, { ...session });
      },
      async find(tokenHash) {
        const session = sessions.get(tokenHash);
        return session ? { ...session } : null;
      },
      async delete(tokenHash) {
        sessions.delete(tokenHash);
      },
    },

    workspaces: {
      get: (workspaceId) =>
        inStore(workspaceId, null, (store) => store.workspace),
      async create(workspace) {
        if (stores.has(workspace.id)) {
          throw new Error(`Workspace ${workspace.id} already exists`);
        }
        stores.set(workspace.id, emptyStore(structuredClone(workspace)));
      },
    },

    clients: {
      list: (workspaceId) =>
        inStore(workspaceId, [], (store) => [...store.clients].sort(byName)),
      get: (workspaceId, clientId) =>
        inStore(
          workspaceId,
          null,
          (store) => store.clients.find((c) => c.id === clientId) ?? null,
        ),
      overview: (workspaceId) =>
        inStore(workspaceId, [], (store) =>
          store.clients
            .map((client): ClientListItem => {
              const items = store.attentionItems.filter(
                (item) => item.clientId === client.id,
              );
              const latest = store.reports
                .filter((report) => report.clientId === client.id)
                .sort((a, b) => compareText(b.weekStart, a.weekStart))[0];
              const lastMeeting = store.meetings
                .filter((meeting) => meeting.clientId === client.id)
                .map((meeting) => meeting.occurredAt)
                .sort(compareText)
                .at(-1);
              return {
                client,
                attention: {
                  total: items.length,
                  critical: items.filter((i) => i.urgency === 'critical')
                    .length,
                  high: items.filter((i) => i.urgency === 'high').length,
                },
                lastMeetingAt: lastMeeting ?? null,
                latestReport: latest ? toSummary(latest) : null,
              };
            })
            .sort(byOverview),
        ),
      recent: (workspaceId, limit) =>
        inStore(workspaceId, [], (store) =>
          [...store.clientViews]
            .sort((a, b) => compareText(b.viewedAt, a.viewedAt))
            .slice(0, limit)
            .flatMap(
              (view) => store.clients.find((c) => c.id === view.clientId) ?? [],
            ),
        ),
      async recordView(workspaceId, clientId, at) {
        const store = stores.get(workspaceId);
        if (!store?.clients.some((client) => client.id === clientId)) {
          return false;
        }
        store.clientViews = [
          { clientId, viewedAt: at },
          ...store.clientViews.filter((view) => view.clientId !== clientId),
        ];
        return true;
      },
      links: (workspaceId) =>
        inStore(workspaceId, [], (store) =>
          [...store.links].sort(
            (a, b) =>
              compareText(a.tool, b.tool) ||
              compareText(a.externalId, b.externalId),
          ),
        ),
      async sync(workspaceId, tool, { clients, links }) {
        const store = stores.get(workspaceId);
        if (store) syncClients(store, tool, clients, links);
      },
    },

    attention: {
      list: (workspaceId, { clientId } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.attentionItems.filter(forClient(clientId)).sort(byAttention),
        ),
    },

    recommendations: {
      list: (workspaceId, { clientId, status } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.recommendations
            .filter(forClient(clientId))
            .filter((rec) => status === undefined || rec.status === status)
            .sort(byRecommendation),
        ),
      get: (workspaceId, id) =>
        inStore(
          workspaceId,
          null,
          (store) => store.recommendations.find((rec) => rec.id === id) ?? null,
        ),
      async update(workspaceId, id, changes) {
        const store = stores.get(workspaceId);
        if (!store) return null;
        const index = store.recommendations.findIndex((rec) => rec.id === id);
        const current = store.recommendations[index];
        if (!current) return null;
        const updated = {
          ...current,
          ...Object.fromEntries(
            Object.entries(changes).filter(([, value]) => value !== undefined),
          ),
        };
        store.recommendations[index] = updated;
        return structuredClone(updated);
      },
    },

    commitments: {
      list: (workspaceId, { clientId } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.commitments.filter(forClient(clientId)).sort(byCommitment),
        ),
    },

    meetings: {
      list: (workspaceId, { clientId } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.meetings.filter(forClient(clientId)).sort(byMeeting),
        ),
    },

    devices: {
      list: (workspaceId, { clientId } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.devices.filter(forClient(clientId)).sort(byDevice),
        ),
    },

    reports: {
      listSummaries: (workspaceId, { clientId, status } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.reports
            .filter(forClient(clientId))
            .filter(
              (report) => status === undefined || report.status === status,
            )
            .map(toSummary)
            .sort(byReportWeek(clientNameIn(store))),
        ),
      get: (workspaceId, id) =>
        inStore(
          workspaceId,
          null,
          (store) => store.reports.find((report) => report.id === id) ?? null,
        ),
      async setStatus(workspaceId, ids, status, at) {
        const store = stores.get(workspaceId);
        if (!store) return [];
        const wanted = new Set(ids);
        store.reports = store.reports.map((report) =>
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
          store.reports
            .filter((report) => wanted.has(report.id))
            .map(toSummary),
        );
      },
    },

    sources: {
      getMany: (workspaceId, ids) =>
        inStore(workspaceId, [], (store) => {
          const wanted = new Set(ids);
          return inIdOrder(
            ids,
            store.sources.filter((source) => wanted.has(source.id)),
          );
        }),
      listForClient: (workspaceId, clientId) =>
        inStore(workspaceId, [], (store) =>
          store.sources
            .filter((source) => source.clientId === clientId)
            .sort(bySourceRecency),
        ),
    },

    records: {
      async replace(workspaceId, tool, records) {
        const store = stores.get(workspaceId);
        if (store) replaceRecords(store, tool, records);
      },
      async upsert(workspaceId, tool, { sources, attention }) {
        const store = stores.get(workspaceId);
        if (!store) return;
        const sourceIds = new Set(sources.map((s) => s.id));
        const attentionIds = new Set(attention.map((a) => a.id));
        store.sources = [
          ...store.sources.filter((s) => !sourceIds.has(s.id)),
          ...structuredClone(sources),
        ];
        store.attentionItems = [
          ...store.attentionItems.filter((a) => !attentionIds.has(a.id)),
          ...tagged(store, 'attention', tool, attention),
        ];
      },
      async removeTool(workspaceId, tool) {
        const store = stores.get(workspaceId);
        if (!store) return;
        replaceRecords(store, tool, {
          sources: [],
          devices: [],
          meetings: [],
          commitments: [],
          attention: [],
        });
        syncClients(store, tool, [], []);
      },
    },

    connectors: {
      list: (workspaceId) =>
        inStore(workspaceId, [], (store) =>
          store.connectors.map(publicConnector).sort(byTool),
        ),
      get: (workspaceId, tool) =>
        inStore(
          workspaceId,
          null,
          (store) => store.connectors.find((c) => c.tool === tool) ?? null,
        ),
      async save(workspaceId, record) {
        const store = stores.get(workspaceId);
        if (!store) return;
        store.connectors = [
          ...store.connectors.filter((c) => c.tool !== record.tool),
          structuredClone(record),
        ];
      },
      async update(workspaceId, tool, changes) {
        const store = stores.get(workspaceId);
        const index = store?.connectors.findIndex((c) => c.tool === tool) ?? -1;
        if (!store || index === -1) return null;
        const defined = Object.fromEntries(
          Object.entries(changes).filter(([, value]) => value !== undefined),
        );
        store.connectors[index] = {
          ...store.connectors[index]!,
          ...structuredClone(defined),
        };
        return structuredClone(store.connectors[index]!);
      },
      async remove(workspaceId, tool) {
        const store = stores.get(workspaceId);
        if (store) {
          store.connectors = store.connectors.filter((c) => c.tool !== tool);
        }
      },
      async listAll() {
        return [...stores.values()]
          .flatMap((store) =>
            store.connectors.map((c) => ({
              workspaceId: store.workspace.id,
              tool: c.tool,
            })),
          )
          .sort(
            (a, b) =>
              compareText(a.workspaceId, b.workspaceId) ||
              compareText(a.tool, b.tool),
          );
      },
    },

    audit: {
      list: (workspaceId, { tool, clientId } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.auditLog
            .filter((entry) => tool === undefined || entry.tool === tool)
            .filter(
              (entry) =>
                clientId === undefined ||
                entry.clientId === clientId ||
                entry.clientId === null,
            )
            .sort(byAuditRecency)
            .slice(0, AUDIT_PAGE_SIZE),
        ),
      async append(workspaceId, entries) {
        stores.get(workspaceId)?.auditLog.push(...structuredClone(entries));
      },
      async prune(workspaceId, before) {
        const store = stores.get(workspaceId);
        if (store) {
          store.auditLog = store.auditLog.filter(
            (entry) => compareText(entry.at, before) >= 0,
          );
        }
      },
    },

    ping: async () => {},
    close: async () => {},
  };
}
