import type {
  AttentionItem,
  AuditEntry,
  Client,
  ClientListItem,
  Commitment,
  Device,
  Invite,
  Meeting,
  MeetingNote,
  Recipient,
  Recommendation,
  Report,
  ReportQuestion,
  Source,
  Ticket,
  Tool,
  Workspace,
} from '@dossierhq/contracts';
import { AUDIT_COUNT_GROUPS } from '@dossierhq/contracts';
import {
  byAttention,
  byAuditRecency,
  byCommitment,
  byDelivery,
  byDevice,
  byMeeting,
  byName,
  byOverview,
  byQuestion,
  byRecommendation,
  byReportWeek,
  byRunRecency,
  bySourceRecency,
  byTicket,
  byTool,
  byInvite,
  byNote,
  byMember,
  bySessionRecency,
  compareText,
  inAuditGroup,
  inIdOrder,
  toSummary,
} from '../../ordering.js';
import {
  AUDIT_PAGE_SIZE,
  type ClientLink,
  type ConnectorRecord,
  type DatabaseAdapter,
  type Dataset,
  type DeliveryRecord,
  type IntelligenceRun,
  type InviteRecord,
  type Membership,
  type MfaRecord,
  type PasswordResetRecord,
  type SessionRecord,
  type StoredReportSettings,
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
  tickets: Ticket[];
  reports: Report[];
  reportQuestions: ReportQuestion[];
  notes: MeetingNote[];
  /** The token in the workspace's forwarding address, once made. */
  inboxToken: string | null;
  reportSettings: StoredReportSettings | null;
  /** The week the report schedule last drafted. */
  draftedWeek: string | null;
  recipients: Map<string, Recipient[]>;
  deliveries: DeliveryRecord[];
  connectors: ConnectorRecord[];
  auditLog: AuditEntry[];
  /** Which tool wrote each synced record, keyed `table:id`. */
  origin: Map<string, Tool>;
  /** The run that drafted each recommendation, for those a run made. */
  draftedBy: Map<string, string>;
  /** Recommendations whose wording a person changed. */
  edited: Set<string>;
  intelligenceModel: string | null;
  intelligencePreferences: Record<string, unknown>;
  runs: IntelligenceRun[];
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
  tickets: [],
  reports: [],
  reportQuestions: [],
  notes: [],
  inboxToken: null,
  reportSettings: null,
  draftedWeek: null,
  recipients: new Map(),
  deliveries: [],
  connectors: [],
  auditLog: [],
  origin: new Map(),
  draftedBy: new Map(),
  edited: new Set(),
  intelligenceModel: null,
  intelligencePreferences: {},
  runs: [],
});

/** A client's reads, plus the workspace-wide ones. */
const forAuditClient = (clientId?: string) => (entry: AuditEntry) =>
  clientId === undefined ||
  entry.clientId === clientId ||
  entry.clientId === null;

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
  const resets = new Map<string, PasswordResetRecord & { usedAt?: string }>();
  let invites: (InviteRecord & { workspaceId: string })[] = [];
  const hits = new Map<string, string[]>();
  const mfa = new Map<string, MfaRecord>();
  const publicInvite = ({
    tokenHash: _hash,
    invitedByUserId: _by,
    workspaceId: _ws,
    ...invite
  }: InviteRecord & { workspaceId: string }): Invite => invite;

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
      tickets: initial.tickets,
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
    store.tickets = store.tickets.filter(keep);
    store.reports = store.reports.filter(keep);
    store.reportQuestions = store.reportQuestions.filter(keep);
    store.deliveries = store.deliveries.filter(keep);
    for (const id of ids) store.recipients.delete(id);
    // Notes go back to the inbox, like ON DELETE SET NULL.
    for (const note of store.notes) {
      if (note.clientId !== null && ids.has(note.clientId)) {
        note.clientId = null;
      }
    }
    // Audit entries outlive their client, as in the SQL schema.
    store.runs = store.runs.filter(keep);
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
    store.tickets = [
      ...withoutTool(store, 'ticket', tool, store.tickets),
      ...tagged(store, 'ticket', tool, records.tickets),
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
      async createOwner(workspace, user) {
        const email = user.email.toLowerCase();
        if (users.some((u) => u.email === email)) return false;
        stores.set(workspace.id, emptyStore(structuredClone(workspace)));
        users.push({ ...user, email });
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
      async setPassword(userId, passwordHash) {
        const user = users.find((u) => u.id === userId);
        if (user) user.passwordHash = passwordHash;
      },
      async members(workspaceId) {
        return memberships
          .filter((m) => m.workspaceId === workspaceId)
          .flatMap((m) => {
            const user = users.find((u) => u.id === m.userId);
            if (!user) return [];
            const { passwordHash: _hash, ...rest } = user;
            return [{ ...rest, role: m.role }];
          })
          .sort(byMember);
      },
      async setRole(workspaceId, userId, role) {
        const membership = memberships.find(
          (m) => m.workspaceId === workspaceId && m.userId === userId,
        );
        if (!membership) return false;
        membership.role = role;
        return true;
      },
      async removeMember(workspaceId, userId) {
        const index = memberships.findIndex(
          (m) => m.workspaceId === workspaceId && m.userId === userId,
        );
        if (index === -1) return false;
        memberships.splice(index, 1);
        for (const [tokenHash, session] of sessions) {
          if (
            session.userId === userId &&
            session.workspaceId === workspaceId
          ) {
            sessions.delete(tokenHash);
          }
        }
        if (!memberships.some((m) => m.userId === userId)) {
          users.splice(
            users.findIndex((u) => u.id === userId),
            1,
          );
          for (const [tokenHash, reset] of resets) {
            if (reset.userId === userId) resets.delete(tokenHash);
          }
          mfa.delete(userId);
        }
        return true;
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
      async touch(tokenHash, at) {
        const session = sessions.get(tokenHash);
        if (session) session.lastSeenAt = at;
      },
      async listForUser(userId) {
        return [...sessions.values()]
          .filter((s) => s.userId === userId)
          .map((s) => ({ ...s }))
          .sort(bySessionRecency);
      },
      async deleteForUser(userId, except) {
        for (const [tokenHash, session] of sessions) {
          if (session.userId === userId && tokenHash !== except) {
            sessions.delete(tokenHash);
          }
        }
      },
      async deleteEnded(now, unusedSince) {
        let deleted = 0;
        for (const [tokenHash, session] of sessions) {
          if (
            compareText(session.expiresAt, now) <= 0 ||
            compareText(session.lastSeenAt, unusedSince) < 0
          ) {
            sessions.delete(tokenHash);
            deleted++;
          }
        }
        return deleted;
      },
    },

    invites: {
      async list(workspaceId) {
        return invites
          .filter((invite) => invite.workspaceId === workspaceId)
          .map(publicInvite)
          .sort(byInvite);
      },
      async save(workspaceId, invite) {
        const email = invite.email.toLowerCase();
        invites = [
          ...invites.filter(
            (i) => !(i.workspaceId === workspaceId && i.email === email),
          ),
          { ...structuredClone(invite), email, workspaceId },
        ];
      },
      async findByToken(tokenHash) {
        const invite = invites.find((i) => i.tokenHash === tokenHash);
        return invite
          ? { ...publicInvite(invite), workspaceId: invite.workspaceId }
          : null;
      },
      async remove(workspaceId, id) {
        const before = invites.length;
        invites = invites.filter(
          (i) => !(i.workspaceId === workspaceId && i.id === id),
        );
        return invites.length < before;
      },
      async accept(tokenHash, user, now) {
        const invite = invites.find(
          (i) => i.tokenHash === tokenHash && compareText(i.expiresAt, now) > 0,
        );
        if (!invite) return 'invalid';
        if (users.some((u) => u.email === invite.email)) return 'taken';
        users.push({ ...user, email: invite.email });
        memberships.push({
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: invite.role,
        });
        invites = invites.filter((i) => i !== invite);
        return 'accepted';
      },
    },

    mfa: {
      async get(userId) {
        const record = mfa.get(userId);
        return record ? structuredClone(record) : null;
      },
      async begin(userId, secret, at) {
        if (mfa.get(userId)?.enabledAt) return false;
        mfa.set(userId, {
          userId,
          secret,
          enabledAt: null,
          lastStep: null,
          recoveryHashes: [],
          createdAt: at,
        });
        return true;
      },
      async enable(userId, recoveryHashes, at) {
        const record = mfa.get(userId);
        if (!record || record.enabledAt) return false;
        record.enabledAt = at;
        record.recoveryHashes = [...recoveryHashes];
        return true;
      },
      async useStep(userId, step) {
        const record = mfa.get(userId);
        if (!record?.enabledAt) return false;
        if (record.lastStep !== null && record.lastStep >= step) return false;
        record.lastStep = step;
        return true;
      },
      async useRecoveryCode(userId, hash) {
        const record = mfa.get(userId);
        if (!record?.enabledAt || !record.recoveryHashes.includes(hash)) {
          return false;
        }
        record.recoveryHashes = record.recoveryHashes.filter((h) => h !== hash);
        return true;
      },
      async remove(userId) {
        mfa.delete(userId);
      },
    },

    rateLimits: {
      async count(bucket, since) {
        return (hits.get(bucket) ?? []).filter(
          (at) => compareText(at, since) >= 0,
        ).length;
      },
      async hit(bucket, at) {
        hits.set(bucket, [...(hits.get(bucket) ?? []), at]);
      },
      async clear(bucket) {
        hits.delete(bucket);
      },
      async prune(before) {
        for (const [bucket, times] of hits) {
          const kept = times.filter((at) => compareText(at, before) >= 0);
          if (kept.length > 0) hits.set(bucket, kept);
          else hits.delete(bucket);
        }
      },
    },

    passwordResets: {
      async create(reset) {
        for (const [tokenHash, old] of resets) {
          if (old.userId === reset.userId && !old.usedAt) {
            resets.delete(tokenHash);
          }
        }
        resets.set(reset.tokenHash, { ...reset });
      },
      async consume(tokenHash, now) {
        const reset = resets.get(tokenHash);
        if (!reset || reset.usedAt || reset.expiresAt <= now) return null;
        reset.usedAt = now;
        return reset.userId;
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
        if (changes.title !== undefined || changes.reason !== undefined) {
          store.edited.add(id);
        }
        return structuredClone(updated);
      },
      async replaceDrafts(workspaceId, clientId, runId, drafts) {
        const store = stores.get(workspaceId);
        if (!store) return;
        const replaced = new Set(
          store.recommendations
            .filter(
              (rec) =>
                rec.clientId === clientId &&
                rec.status === 'draft' &&
                store.draftedBy.has(rec.id) &&
                !store.edited.has(rec.id),
            )
            .map((rec) => rec.id),
        );
        for (const id of replaced) store.draftedBy.delete(id);
        store.recommendations = [
          ...store.recommendations.filter((rec) => !replaced.has(rec.id)),
          ...structuredClone(drafts),
        ];
        for (const draft of drafts) store.draftedBy.set(draft.id, runId);
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

    tickets: {
      list: (workspaceId, { clientId } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.tickets.filter(forClient(clientId)).sort(byTicket),
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
      async save(workspaceId, report) {
        const store = stores.get(workspaceId);
        if (!store) return;
        const saved = structuredClone(report);
        const index = store.reports.findIndex((r) => r.id === report.id);
        if (index === -1) store.reports.push(saved);
        else store.reports[index] = saved;
      },
      async setStatus(workspaceId, ids, status, at) {
        const store = stores.get(workspaceId);
        if (!store) return [];
        const wanted = new Set(
          store.reports
            .filter((report) => ids.includes(report.id) && !report.sentAt)
            .map((report) => report.id),
        );
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
      async markSent(workspaceId, id, at) {
        const report = stores
          .get(workspaceId)
          ?.reports.find((r) => r.id === id);
        if (!report || report.status !== 'approved' || report.sentAt) {
          return false;
        }
        report.sentAt = at;
        return true;
      },
      async clearSent(workspaceId, id) {
        const report = stores
          .get(workspaceId)
          ?.reports.find((r) => r.id === id);
        if (report) report.sentAt = null;
      },
    },

    reportSettings: {
      get: (workspaceId) =>
        inStore(workspaceId, null, (store) => store.reportSettings),
      async save(workspaceId, settings) {
        const store = stores.get(workspaceId);
        if (store) store.reportSettings = structuredClone(settings);
      },
      async listScheduled() {
        return [...stores.entries()]
          .filter(
            ([, store]) =>
              store.reportSettings?.draftAt || store.reportSettings?.sendAt,
          )
          .map(([workspaceId]) => workspaceId)
          .sort(compareText);
      },
      async markDrafted(workspaceId, weekStart) {
        const store = stores.get(workspaceId);
        if (!store?.reportSettings || store.draftedWeek === weekStart) {
          return false;
        }
        store.draftedWeek = weekStart;
        return true;
      },
    },

    recipients: {
      list: (workspaceId, clientId) =>
        inStore(
          workspaceId,
          [],
          (store) => store.recipients.get(clientId) ?? [],
        ),
      async replace(workspaceId, clientId, recipients) {
        const store = stores.get(workspaceId);
        if (!store?.clients.some((client) => client.id === clientId)) return;
        store.recipients.set(clientId, structuredClone(recipients));
      },
    },

    deliveries: {
      list: (workspaceId, reportId) =>
        inStore(workspaceId, [], (store) =>
          store.deliveries
            .filter((delivery) => delivery.reportId === reportId)
            .map(({ messageId: _messageId, ...delivery }) => delivery)
            .sort(byDelivery),
        ),
      async add(workspaceId, delivery) {
        stores.get(workspaceId)?.deliveries.push(structuredClone(delivery));
      },
    },

    notes: {
      list: (workspaceId, clientId) =>
        inStore(workspaceId, [], (store) =>
          store.notes.filter((n) => n.clientId === clientId).sort(byNote),
        ),
      get: (workspaceId, id) =>
        inStore(
          workspaceId,
          null,
          (store) => store.notes.find((n) => n.id === id) ?? null,
        ),
      async add(workspaceId, note) {
        stores.get(workspaceId)?.notes.push(structuredClone(note));
      },
      async file(workspaceId, id, clientId) {
        const note = stores.get(workspaceId)?.notes.find((n) => n.id === id);
        if (!note) return null;
        note.clientId = clientId;
        return structuredClone(note);
      },
      async remove(workspaceId, id) {
        const store = stores.get(workspaceId);
        if (!store?.notes.some((n) => n.id === id)) return false;
        store.notes = store.notes.filter((n) => n.id !== id);
        return true;
      },
      async inboxToken(workspaceId, fresh) {
        const store = stores.get(workspaceId);
        if (!store) return fresh;
        store.inboxToken ??= fresh;
        return store.inboxToken;
      },
      async inboxWorkspace(token) {
        for (const [workspaceId, store] of stores) {
          if (store.inboxToken === token) return workspaceId;
        }
        return null;
      },
    },

    reportQuestions: {
      list: (workspaceId, { clientId } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.reportQuestions
            .filter(
              (question) =>
                clientId === undefined ||
                question.clientId === null ||
                question.clientId === clientId,
            )
            .sort(byQuestion),
        ),
      async create(workspaceId, question) {
        stores
          .get(workspaceId)
          ?.reportQuestions.push(structuredClone(question));
      },
      async update(workspaceId, id, changes) {
        const question = stores
          .get(workspaceId)
          ?.reportQuestions.find((q) => q.id === id);
        if (!question) return null;
        if (changes.text !== undefined) question.text = changes.text;
        if (changes.clientId !== undefined)
          question.clientId = changes.clientId;
        return structuredClone(question);
      },
      async remove(workspaceId, id) {
        const store = stores.get(workspaceId);
        if (!store?.reportQuestions.some((q) => q.id === id)) return false;
        store.reportQuestions = store.reportQuestions.filter(
          (q) => q.id !== id,
        );
        return true;
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
          tickets: [],
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
      list: (
        workspaceId,
        { kind, tool, clientId, before, after, limit = AUDIT_PAGE_SIZE } = {},
      ) =>
        inStore(workspaceId, [], (store) => {
          const entries = store.auditLog
            .filter((entry) => kind === undefined || entry.kind === kind)
            .filter((entry) => tool === undefined || entry.tool === tool)
            .filter(forAuditClient(clientId))
            .filter((entry) => !before || byAuditRecency(entry, before) > 0)
            .filter((entry) => !after || byAuditRecency(entry, after) < 0)
            .sort(byAuditRecency);
          // Just newer than `after` means the end of what sorts before it.
          return after
            ? entries.slice(Math.max(0, entries.length - limit))
            : entries.slice(0, limit);
        }),
      counts: (workspaceId, { clientId } = {}) =>
        inStore(
          workspaceId,
          AUDIT_COUNT_GROUPS.map((group) => ({ ...group, count: 0 })),
          (store) => {
            const entries = store.auditLog.filter(forAuditClient(clientId));
            return AUDIT_COUNT_GROUPS.map((group) => ({
              ...group,
              count: entries.filter(inAuditGroup(group)).length,
            }));
          },
        ),
      async append(workspaceId, entries) {
        stores.get(workspaceId)?.auditLog.push(...structuredClone(entries));
      },
      async prune(workspaceId, before, kinds) {
        const store = stores.get(workspaceId);
        if (store) {
          store.auditLog = store.auditLog.filter(
            (entry) =>
              !kinds.includes(entry.kind) || compareText(entry.at, before) >= 0,
          );
        }
      },
    },

    intelligence: {
      model: (workspaceId) =>
        inStore(workspaceId, null, (store) => store.intelligenceModel),
      async setModel(workspaceId, model) {
        const store = stores.get(workspaceId);
        if (store) store.intelligenceModel = model;
      },
      preferences: (workspaceId) =>
        inStore(workspaceId, {}, (store) => store.intelligencePreferences),
      async setPreferences(workspaceId, preferences) {
        const store = stores.get(workspaceId);
        if (store) store.intelligencePreferences = structuredClone(preferences);
      },
      lastRun: (workspaceId, kind, clientId) =>
        inStore(
          workspaceId,
          null,
          (store) =>
            store.runs
              .filter((run) => run.kind === kind && run.clientId === clientId)
              .sort(byRunRecency)[0] ?? null,
        ),
      async saveRun(workspaceId, run) {
        const store = stores.get(workspaceId);
        if (!store) return;
        store.runs = [
          ...store.runs.filter((saved) => saved.id !== run.id),
          structuredClone(run),
        ];
      },
      runs: (workspaceId, since) =>
        inStore(workspaceId, [], (store) =>
          store.runs
            .filter((run) => compareText(run.startedAt, since) >= 0)
            .sort(byRunRecency),
        ),
    },

    ping: async () => {},
    close: async () => {},
  };
}
