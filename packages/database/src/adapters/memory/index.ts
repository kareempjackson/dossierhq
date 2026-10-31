import type {
  AskAnswer,
  AttentionItem,
  AuditEntry,
  Client,
  ClientListItem,
  Commitment,
  Device,
  Invite,
  Meeting,
  MeetingNote,
  Pattern,
  PlatformPerson,
  Recipient,
  Recommendation,
  Report,
  ReportQuestion,
  Source,
  StaffAuditEntry,
  StaffInvite,
  SupportGrant,
  Ticket,
  Tool,
  Workspace,
  WorkspaceSummary,
} from '@dossierhq/contracts';
import { AUDIT_COUNT_GROUPS } from '@dossierhq/contracts';
import {
  byAsked,
  byAttention,
  byAuditRecency,
  byCommitment,
  byDelivery,
  byDocument,
  byDevice,
  byEvent,
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
  byNotification,
  byMember,
  byNewestWorkspace,
  bySessionRecency,
  compareText,
  inAuditGroup,
  inIdOrder,
  toSummary,
} from '../../ordering.js';
import { withPoints } from '../../rows.js';
import {
  AUDIT_PAGE_SIZE,
  type ClientLink,
  type ConnectorRecord,
  type ContractDocumentFile,
  type DatabaseAdapter,
  type Dataset,
  type DeliveryRecord,
  type EventRecord,
  type IntelligenceRun,
  type InviteRecord,
  type MeetingPointsRecord,
  type Membership,
  type MfaRecord,
  type NotificationRecord,
  type PasswordResetRecord,
  type SessionRecord,
  type SignUpRecord,
  type StaffInviteRecord,
  type StaffRecord,
  type StaffSessionRecord,
  type StoredIntelligenceKey,
  type StoredReportSettings,
  type SupportGrantRecord,
  type ToolRecords,
  type UserRecord,
  type WorkspaceSuspension,
} from '../../types.js';

/** An event as the outbox keeps it. */
type StoredEvent = EventRecord & {
  nextAttemptAt: string;
  lockedUntil: string | null;
  dispatchedAt: string | null;
  failedAt: string | null;
  lastError: string | null;
};

/** One workspace's data. Records a sync wrote carry the tool in `origin`. */
type Store = {
  workspace: Workspace;
  createdAt: string;
  suspension: WorkspaceSuspension | null;
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
  /** What Claude read from meetings and notes; `missingSince` as in SQL. */
  meetingPoints: (MeetingPointsRecord & { missingSince: string | null })[];
  /** The token in the workspace's forwarding address, once made. */
  inboxToken: string | null;
  reportSettings: StoredReportSettings | null;
  /** The week the report schedule last drafted. */
  draftedWeek: string | null;
  recipients: Map<string, Recipient[]>;
  deliveries: DeliveryRecord[];
  documents: ContractDocumentFile[];
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
  intelligenceKeys: StoredIntelligenceKey[];
  /** What onboarding learned about the company. */
  profile: Record<string, unknown>;
  runs: IntelligenceRun[];
  answers: AskAnswer[];
  patterns: Pattern[];
  events: StoredEvent[];
  notifications: (NotificationRecord & { emailClaimedAt: string | null })[];
  /** Each member's saved notification preferences, by user ID. */
  notificationPreferences: Map<string, Record<string, unknown>>;
};

const emptyStore = (workspace: Workspace): Store => ({
  workspace,
  createdAt: new Date().toISOString(),
  suspension: null,
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
  meetingPoints: [],
  inboxToken: null,
  reportSettings: null,
  draftedWeek: null,
  recipients: new Map(),
  deliveries: [],
  documents: [],
  connectors: [],
  auditLog: [],
  origin: new Map(),
  draftedBy: new Map(),
  edited: new Set(),
  intelligenceModel: null,
  intelligencePreferences: {},
  intelligenceKeys: [],
  profile: {},
  runs: [],
  answers: [],
  patterns: [],
  events: [],
  notifications: [],
  notificationPreferences: new Map(),
});

/** When accounts a dataset brings count as having finished onboarding. */
const SEEDED_AT = '2026-01-01T00:00:00.000Z';

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
  /** When each account was made; seeded ones count from now. */
  const seededAt = new Date().toISOString();
  const userCreated = new Map<string, string>();
  const staff: StaffRecord[] = [];
  const staffSessions = new Map<string, StaffSessionRecord>();
  let staffInvites: StaffInviteRecord[] = [];
  const staffLog: StaffAuditEntry[] = [];
  let grants: SupportGrantRecord[] = [];
  const publicGrant = ({
    staffId: _staff,
    actingUserId: _acting,
    handoffHash: _handoff,
    handoffExpiresAt: _until,
    sessionHash: _session,
    ...grant
  }: SupportGrantRecord): SupportGrant => structuredClone(grant);
  const publicStaff = ({
    passwordHash: _hash,
    totpSecret: _secret,
    totpLastStep: _step,
    recoveryHashes: _codes,
    ...rest
  }: StaffRecord) => rest;
  const publicStaffInvite = ({
    tokenHash: _hash,
    invitedByStaffId: _by,
    ...invite
  }: StaffInviteRecord): StaffInvite => invite;

  /** Deletes an account left in no workspace, and what hangs off it. */
  function forgetUserIfAlone(userId: string) {
    if (memberships.some((m) => m.userId === userId)) return;
    const index = users.findIndex((u) => u.id === userId);
    if (index !== -1) users.splice(index, 1);
    userCreated.delete(userId);
    for (const [tokenHash, session] of sessions) {
      if (session.userId === userId) sessions.delete(tokenHash);
    }
    for (const [tokenHash, reset] of resets) {
      if (reset.userId === userId) resets.delete(tokenHash);
    }
    mfa.delete(userId);
    onboarding.delete(userId);
    for (const grant of grants) {
      if (grant.actingUserId === userId) grant.actingUserId = null;
    }
    // Their questions stay, like ON DELETE SET NULL.
    for (const store of stores.values()) {
      for (const answer of store.answers) {
        if (answer.askedBy.userId === userId) answer.askedBy.userId = null;
      }
    }
  }

  /** The newest of some times, or null. */
  const latest = (times: string[]) =>
    times.length === 0 ? null : times.reduce((a, b) => (b > a ? b : a));

  /** A workspace as platform_workspaces() returns it. */
  function summaryOf(store: Store): WorkspaceSummary {
    const { id, name, timeZone } = store.workspace;
    const members = memberships.filter((m) => m.workspaceId === id);
    const [owner] = members
      .filter((m) => m.role === 'owner')
      .flatMap((m) => users.filter((u) => u.id === m.userId))
      .sort(
        (a, b) =>
          compareText(
            userCreated.get(a.id) ?? seededAt,
            userCreated.get(b.id) ?? seededAt,
          ) || compareText(a.id, b.id),
      );
    return {
      id,
      name,
      timeZone,
      createdAt: store.createdAt,
      suspension: store.suspension && { ...store.suspension },
      owner: owner ? { name: owner.name, email: owner.email } : null,
      members: members.length,
      clients: store.clients.length,
      connectors: store.connectors.length,
      failingConnectors: store.connectors.filter((c) => c.status === 'failing')
        .length,
      lastActiveAt: latest(
        [...sessions.values()]
          .filter((s) => s.workspaceId === id)
          .map((s) => s.lastSeenAt),
      ),
    };
  }

  /** In the workspace's name or ID, or a member's email, as the SQL matches. */
  function workspaceMatches(store: Store, search: string) {
    const wanted = search.toLowerCase();
    const { id, name } = store.workspace;
    return (
      name.toLowerCase().includes(wanted) ||
      id.toLowerCase().includes(wanted) ||
      memberships.some(
        (m) =>
          m.workspaceId === id &&
          users.some((u) => u.id === m.userId && u.email.includes(wanted)),
      )
    );
  }
  const signUps = new Map<string, SignUpRecord>();
  /**
   * Onboarding for accounts made here; those a dataset brings count as done,
   * like accounts from before onboarding existed.
   */
  const onboarding = new Map<
    string,
    { onboardedAt: string | null; twoFactorRequired: boolean }
  >();
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
    store.documents = store.documents.filter((f) => keep(f.document));
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

  function pointsOf(store: Store, id: string) {
    return store.meetingPoints.find((p) => p.id === id);
  }

  /** What cites notes and was read from them, like the SQL cascades. */
  function dropNoteReads(store: Store, noteId: string) {
    store.sources = store.sources.filter(
      (s) => !(s.kind === 'note' && s.noteId === noteId),
    );
    store.meetingPoints = store.meetingPoints.filter((p) => p.id !== noteId);
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
      async setProfile(userId, { name, title }) {
        const user = users.find((u) => u.id === userId);
        if (user) Object.assign(user, { name, title });
      },
      async setup(userId) {
        if (!users.some((u) => u.id === userId)) return null;
        const state = onboarding.get(userId) ?? {
          onboardedAt: SEEDED_AT,
          twoFactorRequired: false,
        };
        return { ...state, twoFactorOn: Boolean(mfa.get(userId)?.enabledAt) };
      },
      async finishOnboarding(userId, at, twoFactorRequired) {
        if (!users.some((u) => u.id === userId)) return;
        onboarding.set(userId, { onboardedAt: at, twoFactorRequired });
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
        stores.get(workspaceId)?.notificationPreferences.delete(userId);
        for (const [tokenHash, session] of sessions) {
          if (
            session.userId === userId &&
            session.workspaceId === workspaceId
          ) {
            sessions.delete(tokenHash);
          }
        }
        forgetUserIfAlone(userId);
        return true;
      },
    },

    sessions: {
      async create(session) {
        sessions.set(session.tokenHash, { ...session });
      },
      async find(tokenHash) {
        const session = sessions.get(tokenHash);
        const store = session && stores.get(session.workspaceId);
        return session && store
          ? { ...session, workspaceSuspended: store.suspension !== null }
          : null;
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
        userCreated.set(user.id, now);
        onboarding.set(user.id, {
          onboardedAt: null,
          twoFactorRequired: false,
        });
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

    signUps: {
      async save(signUp) {
        const email = signUp.email.toLowerCase();
        for (const [tokenHash, old] of signUps) {
          if (old.email === email) signUps.delete(tokenHash);
        }
        signUps.set(signUp.tokenHash, { ...signUp, email });
      },
      async find(tokenHash) {
        const signUp = signUps.get(tokenHash);
        return signUp ? { ...signUp } : null;
      },
      async findByEmail(email) {
        const wanted = email.toLowerCase();
        const signUp = [...signUps.values()].find((s) => s.email === wanted);
        return signUp ? { ...signUp } : null;
      },
      async complete(tokenHash, workspace, user, now) {
        const signUp = signUps.get(tokenHash);
        if (!signUp || compareText(signUp.expiresAt, now) <= 0) {
          return 'invalid';
        }
        signUps.delete(tokenHash);
        if (users.some((u) => u.email === signUp.email)) return 'taken';
        stores.set(workspace.id, emptyStore(structuredClone(workspace)));
        users.push({
          ...user,
          email: signUp.email,
          passwordHash: signUp.passwordHash,
        });
        userCreated.set(user.id, now);
        onboarding.set(user.id, {
          onboardedAt: null,
          twoFactorRequired: false,
        });
        memberships.push({
          workspaceId: workspace.id,
          userId: user.id,
          role: 'owner',
        });
        return 'created';
      },
      async deleteExpired(now) {
        let deleted = 0;
        for (const [tokenHash, signUp] of signUps) {
          if (compareText(signUp.expiresAt, now) <= 0) {
            signUps.delete(tokenHash);
            deleted++;
          }
        }
        return deleted;
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
      suspension: (workspaceId) =>
        inStore(workspaceId, null, (store) =>
          store.suspension ? { ...store.suspension } : null,
        ),
      async update(workspaceId, { name, timeZone }) {
        const store = stores.get(workspaceId);
        if (!store) return;
        if (name !== undefined) store.workspace.name = name;
        if (timeZone !== undefined) store.workspace.timeZone = timeZone;
      },
      profile: (workspaceId) =>
        inStore(workspaceId, {}, (store) => store.profile),
      async setProfile(workspaceId, profile) {
        const store = stores.get(workspaceId);
        if (store) store.profile = structuredClone(profile);
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
      async setContract(workspaceId, clientId, contract) {
        const client = stores
          .get(workspaceId)
          ?.clients.find((c) => c.id === clientId);
        if (!client) return null;
        client.contract = structuredClone(contract);
        return structuredClone(client);
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
          store.meetings
            .filter(forClient(clientId))
            .map((m) => withPoints(m, pointsOf(store, m.id)))
            .sort(byMeeting),
        ),
    },

    meetingPoints: {
      states: (workspaceId, ids) =>
        inStore(workspaceId, [], (store) =>
          store.meetingPoints
            .filter((p) => ids.includes(p.id))
            .map(({ missingSince: _missing, ...record }) => record),
        ),
      async save(workspaceId, clientId, record, excerpts) {
        const store = stores.get(workspaceId);
        if (!store) return;
        if (record.subject === 'note') {
          const note = store.notes.find((n) => n.id === record.id);
          if (note?.clientId !== clientId) return;
        }
        if (record.subject === 'note' && excerpts) {
          store.sources = [
            ...store.sources.filter(
              (s) => !(s.kind === 'note' && s.noteId === record.id && s.quote),
            ),
            ...structuredClone(excerpts),
          ];
        }
        store.meetingPoints = [
          ...store.meetingPoints.filter((p) => p.id !== record.id),
          { ...structuredClone(record), missingSince: null },
        ];
      },
      async prune(workspaceId, now, before) {
        const store = stores.get(workspaceId);
        if (!store) return;
        const meetings = new Set(store.meetings.map((m) => m.id));
        for (const points of store.meetingPoints) {
          if (points.subject !== 'meeting') continue;
          if (meetings.has(points.id)) points.missingSince = null;
          else points.missingSince ??= now;
        }
        store.meetingPoints = store.meetingPoints.filter(
          (p) =>
            p.missingSince === null || compareText(p.missingSince, before) >= 0,
        );
      },
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

    contractDocuments: {
      list: (workspaceId, clientId) =>
        inStore(workspaceId, [], (store) =>
          store.documents
            .map((file) => file.document)
            .filter((document) => document.clientId === clientId)
            .sort(byDocument),
        ),
      get: (workspaceId, id) =>
        inStore(
          workspaceId,
          null,
          (store) => store.documents.find((f) => f.document.id === id) ?? null,
        ),
      async add(workspaceId, document, content) {
        stores.get(workspaceId)?.documents.push({
          document: structuredClone(document),
          content: new Uint8Array(content),
        });
      },
      async remove(workspaceId, id) {
        const store = stores.get(workspaceId);
        const before = store?.documents.length ?? 0;
        if (store) {
          store.documents = store.documents.filter((f) => f.document.id !== id);
        }
        return (store?.documents.length ?? 0) < before;
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
          store.notes
            .filter((n) => n.clientId === clientId)
            .map((n) => withPoints(n, pointsOf(store, n.id)))
            .sort(byNote),
        ),
      get: (workspaceId, id) =>
        inStore(workspaceId, null, (store) => {
          const note = store.notes.find((n) => n.id === id);
          return note ? withPoints(note, pointsOf(store, note.id)) : null;
        }),
      async add(workspaceId, note, source) {
        const store = stores.get(workspaceId);
        if (!store) return;
        store.notes.push(structuredClone(note));
        if (source) store.sources.push(structuredClone(source));
      },
      async file(workspaceId, id, clientId, source) {
        const store = stores.get(workspaceId);
        const note = store?.notes.find((n) => n.id === id);
        if (!store || !note) return null;
        note.clientId = clientId;
        dropNoteReads(store, id);
        if (source) store.sources.push(structuredClone(source));
        return structuredClone(note);
      },
      async remove(workspaceId, id) {
        const store = stores.get(workspaceId);
        if (!store?.notes.some((n) => n.id === id)) return false;
        store.notes = store.notes.filter((n) => n.id !== id);
        dropNoteReads(store, id);
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
          .filter((store) => store.suspension === null)
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
      keys: (workspaceId) =>
        inStore(workspaceId, [], (store) =>
          [...store.intelligenceKeys].sort((a, b) =>
            compareText(a.provider, b.provider),
          ),
        ),
      async saveKey(workspaceId, key) {
        const store = stores.get(workspaceId);
        if (!store) return;
        store.intelligenceKeys = [
          ...store.intelligenceKeys.filter((k) => k.provider !== key.provider),
          structuredClone(key),
        ];
      },
      async removeKey(workspaceId, provider) {
        const store = stores.get(workspaceId);
        if (!store) return;
        store.intelligenceKeys = store.intelligenceKeys.filter(
          (key) => key.provider !== provider,
        );
      },
    },

    ask: {
      list: (workspaceId, { askedBy, limit }) =>
        inStore(workspaceId, [], (store) =>
          store.answers
            .filter(
              (answer) =>
                askedBy === undefined || answer.askedBy.userId === askedBy,
            )
            .sort(byAsked)
            .slice(0, limit)
            .map(
              ({
                lines: _lines,
                sources: _sources,
                model: _model,
                cost: _cost,
                error: _error,
                ...summary
              }) => summary,
            ),
        ),
      get: (workspaceId, id) =>
        inStore(
          workspaceId,
          null,
          (store) => store.answers.find((answer) => answer.id === id) ?? null,
        ),
      async create(workspaceId, answer) {
        stores.get(workspaceId)?.answers.push(structuredClone(answer));
      },
      async update(workspaceId, id, changes) {
        const answer = stores
          .get(workspaceId)
          ?.answers.find((a) => a.id === id && a.status === 'answering');
        if (!answer) return false;
        Object.assign(answer, structuredClone(changes));
        return true;
      },
      async remove(workspaceId, id) {
        const store = stores.get(workspaceId);
        const before = store?.answers.length ?? 0;
        if (store) store.answers = store.answers.filter((a) => a.id !== id);
        return (store?.answers.length ?? 0) < before;
      },
    },

    patterns: {
      list: (workspaceId) =>
        inStore(workspaceId, [], (store) => store.patterns),
      async replace(workspaceId, patterns) {
        const store = stores.get(workspaceId);
        if (store) store.patterns = structuredClone(patterns);
      },
    },

    events: {
      async append(workspaceId, event) {
        const store = stores.get(workspaceId);
        if (!store) return false;
        if (
          event.dedupeKey !== null &&
          store.events.some((e) => e.dedupeKey === event.dedupeKey)
        ) {
          return false;
        }
        store.events.push({
          ...structuredClone(event),
          workspaceId,
          attempts: 0,
          nextAttemptAt: event.occurredAt,
          lockedUntil: null,
          dispatchedAt: null,
          failedAt: null,
          lastError: null,
        });
        return true;
      },
      async claim(now, until, limit) {
        const due = [...stores.values()]
          .flatMap((store) => store.events)
          .filter(
            (e) =>
              e.dispatchedAt === null &&
              e.failedAt === null &&
              compareText(e.nextAttemptAt, now) <= 0 &&
              (e.lockedUntil === null || compareText(e.lockedUntil, now) <= 0),
          )
          .sort(
            (a, b) =>
              compareText(a.nextAttemptAt, b.nextAttemptAt) ||
              compareText(a.id, b.id),
          )
          .slice(0, limit);
        for (const event of due) {
          event.lockedUntil = until;
          event.attempts += 1;
        }
        return structuredClone(
          due
            .map(
              ({
                nextAttemptAt: _next,
                lockedUntil: _locked,
                dispatchedAt: _dispatched,
                failedAt: _failed,
                lastError: _error,
                ...event
              }) => event,
            )
            .sort(byEvent),
        );
      },
      async markDispatched(workspaceId, id, at) {
        const event = stores.get(workspaceId)?.events.find((e) => e.id === id);
        if (event)
          Object.assign(event, { dispatchedAt: at, lockedUntil: null });
      },
      async retry(workspaceId, id, nextAttemptAt, error) {
        const event = stores.get(workspaceId)?.events.find((e) => e.id === id);
        if (event) {
          Object.assign(event, {
            nextAttemptAt,
            lockedUntil: null,
            lastError: error,
          });
        }
      },
      async markFailed(workspaceId, id, at, error) {
        const event = stores.get(workspaceId)?.events.find((e) => e.id === id);
        if (event) {
          Object.assign(event, {
            failedAt: at,
            lockedUntil: null,
            lastError: error,
          });
        }
      },
      async prune(workspaceId, before) {
        const store = stores.get(workspaceId);
        if (store) {
          store.events = store.events.filter(
            (e) =>
              (e.dispatchedAt === null && e.failedAt === null) ||
              compareText(e.occurredAt, before) >= 0,
          );
        }
      },
    },

    notifications: {
      async add(workspaceId, notifications) {
        const store = stores.get(workspaceId);
        if (!store) return;
        for (const notification of notifications) {
          const known = store.notifications.some(
            (n) =>
              n.id === notification.id ||
              (n.eventId === notification.eventId &&
                n.userId === notification.userId),
          );
          if (!known) {
            store.notifications.push({
              ...structuredClone(notification),
              emailClaimedAt: null,
            });
          }
        }
      },
      forEvent: (workspaceId, eventId) =>
        inStore(workspaceId, [], (store) =>
          store.notifications
            .filter((n) => n.eventId === eventId)
            .map(({ emailClaimedAt: _claimed, ...n }) => n)
            .sort(byNotification),
        ),
      list: (workspaceId, userId, { before, unread, limit = 30 } = {}) =>
        inStore(workspaceId, [], (store) =>
          store.notifications
            .filter((n) => n.userId === userId && n.inApp)
            .filter((n) => !unread || n.readAt === null)
            .filter(
              (n) =>
                !before ||
                byNotification(n, { createdAt: before.at, id: before.id }) > 0,
            )
            .map(({ emailClaimedAt: _claimed, ...n }) => n)
            .sort(byNotification)
            .slice(0, limit),
        ),
      countUnread: (workspaceId, userId) =>
        inStore(
          workspaceId,
          0,
          (store) =>
            store.notifications.filter(
              (n) => n.userId === userId && n.inApp && n.readAt === null,
            ).length,
        ),
      async markRead(workspaceId, userId, ids, at) {
        const store = stores.get(workspaceId);
        if (!store) return 0;
        const marking = store.notifications.filter(
          (n) =>
            n.userId === userId &&
            n.inApp &&
            n.readAt === null &&
            (ids === 'all' || ids.includes(n.id)),
        );
        for (const n of marking) n.readAt = at;
        return marking.length;
      },
      async claimEmail(workspaceId, id, at, staleBefore) {
        const n = stores
          .get(workspaceId)
          ?.notifications.find((n) => n.id === id);
        if (
          !n ||
          !n.email ||
          n.emailSentAt !== null ||
          (n.emailClaimedAt !== null &&
            compareText(n.emailClaimedAt, staleBefore) >= 0)
        ) {
          return false;
        }
        n.emailClaimedAt = at;
        return true;
      },
      async markEmailed(workspaceId, id, at) {
        const n = stores
          .get(workspaceId)
          ?.notifications.find((n) => n.id === id);
        if (n) n.emailSentAt = at;
      },
      async releaseEmail(workspaceId, id) {
        const n = stores
          .get(workspaceId)
          ?.notifications.find((n) => n.id === id);
        if (n && n.emailSentAt === null) n.emailClaimedAt = null;
      },
      async prune(workspaceId, before) {
        const store = stores.get(workspaceId);
        if (store) {
          store.notifications = store.notifications.filter(
            (n) => compareText(n.createdAt, before) >= 0,
          );
        }
      },
      preferences: (workspaceId) =>
        inStore(workspaceId, {}, (store) =>
          Object.fromEntries(store.notificationPreferences),
        ),
      async setPreferences(workspaceId, userId, preferences) {
        const store = stores.get(workspaceId);
        const member = memberships.some(
          (m) => m.workspaceId === workspaceId && m.userId === userId,
        );
        if (!store || !member) return false;
        store.notificationPreferences.set(userId, structuredClone(preferences));
        return true;
      },
    },

    staff: {
      async list() {
        return staff.map(publicStaff).sort(byMember);
      },
      async get(id) {
        const found = staff.find((s) => s.id === id);
        return found ? structuredClone(found) : null;
      },
      async findByEmail(email) {
        const wanted = email.toLowerCase();
        const found = staff.find((s) => s.email === wanted);
        return found ? structuredClone(found) : null;
      },
      async setRole(id, role) {
        const found = staff.find((s) => s.id === id);
        if (found) found.role = role;
        return Boolean(found);
      },
      async disable(id, at) {
        const found = staff.find((s) => s.id === id && !s.disabledAt);
        if (found) found.disabledAt = at;
        for (const [tokenHash, session] of staffSessions) {
          if (session.staffId === id) staffSessions.delete(tokenHash);
        }
        return Boolean(found);
      },
      async setPassword(id, passwordHash) {
        const found = staff.find((s) => s.id === id);
        if (found) found.passwordHash = passwordHash;
      },
      async useStep(id, step) {
        const found = staff.find((s) => s.id === id && !s.disabledAt);
        if (!found || (found.totpLastStep ?? -1) >= step) return false;
        found.totpLastStep = step;
        return true;
      },
      async useRecoveryCode(id, hash) {
        const found = staff.find((s) => s.id === id && !s.disabledAt);
        if (!found?.recoveryHashes.includes(hash)) return false;
        found.recoveryHashes = found.recoveryHashes.filter((h) => h !== hash);
        return true;
      },
      async invites() {
        return staffInvites.map(publicStaffInvite).sort(byInvite);
      },
      async saveInvite(invite) {
        const email = invite.email.toLowerCase();
        staffInvites = [
          ...staffInvites.filter((i) => i.email !== email),
          { ...invite, email },
        ];
      },
      async findInvite(tokenHash) {
        const invite = staffInvites.find((i) => i.tokenHash === tokenHash);
        return invite ? publicStaffInvite(invite) : null;
      },
      async removeInvite(id) {
        const before = staffInvites.length;
        staffInvites = staffInvites.filter((i) => i.id !== id);
        return staffInvites.length < before;
      },
      async acceptInvite(tokenHash, member, now) {
        const invite = staffInvites.find(
          (i) => i.tokenHash === tokenHash && compareText(i.expiresAt, now) > 0,
        );
        if (!invite) return 'invalid';
        if (staff.some((s) => s.email === invite.email)) return 'taken';
        staff.push({
          ...structuredClone(member),
          email: invite.email,
          role: invite.role,
        });
        staffInvites = staffInvites.filter((i) => i !== invite);
        return 'accepted';
      },
    },

    staffSessions: {
      async create(session) {
        staffSessions.set(session.tokenHash, { ...session });
      },
      async find(tokenHash) {
        const session = staffSessions.get(tokenHash);
        return session ? { ...session } : null;
      },
      async delete(tokenHash) {
        staffSessions.delete(tokenHash);
      },
      async touch(tokenHash, at) {
        const session = staffSessions.get(tokenHash);
        if (session) session.lastSeenAt = at;
      },
      async deleteEnded(now, unusedSince) {
        let deleted = 0;
        for (const [tokenHash, session] of staffSessions) {
          if (
            compareText(session.expiresAt, now) <= 0 ||
            compareText(session.lastSeenAt, unusedSince) < 0
          ) {
            staffSessions.delete(tokenHash);
            deleted++;
          }
        }
        return deleted;
      },
    },

    staffAudit: {
      async append(entry) {
        staffLog.push(structuredClone(entry));
      },
      async list({ workspaceId, before, after, limit = AUDIT_PAGE_SIZE } = {}) {
        const entries = staffLog
          .filter(
            (e) => workspaceId === undefined || e.workspaceId === workspaceId,
          )
          .filter((e) => !before || byAuditRecency(e, before) > 0)
          .filter((e) => !after || byAuditRecency(e, after) < 0)
          .sort(byAuditRecency)
          .map((e) => structuredClone(e));
        return after
          ? entries.slice(Math.max(0, entries.length - limit))
          : entries.slice(0, limit);
      },
    },

    platform: {
      async workspaces({ search, status, limit, offset }) {
        const matching = [...stores.values()]
          .filter(
            (store) =>
              status === undefined ||
              (status === 'suspended') === (store.suspension !== null),
          )
          .filter(
            (store) => search === undefined || workspaceMatches(store, search),
          )
          .map(summaryOf)
          .sort(byNewestWorkspace);
        return {
          data: matching.slice(offset, offset + limit),
          total: matching.length,
        };
      },
      async workspace(workspaceId) {
        const store = stores.get(workspaceId);
        return store ? summaryOf(store) : null;
      },
      async people({ search, workspaceId, userId, limit }) {
        const now = new Date().toISOString();
        const wanted = search?.toLowerCase();
        return users
          .flatMap((user) => {
            const mine = memberships.filter((m) => m.userId === user.id);
            return (mine.length > 0 ? mine : [null]).map((membership) => ({
              user,
              membership,
            }));
          })
          .filter(
            ({ user, membership }) =>
              (userId === undefined || user.id === userId) &&
              (workspaceId === undefined ||
                membership?.workspaceId === workspaceId) &&
              (wanted === undefined ||
                user.email.includes(wanted) ||
                user.name.toLowerCase().includes(wanted)),
          )
          .map(({ user, membership }): PlatformPerson => {
            const signedIn = [...sessions.values()].filter(
              (s) => s.userId === user.id,
            );
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              title: user.title,
              createdAt: userCreated.get(user.id) ?? seededAt,
              workspace: membership
                ? {
                    id: membership.workspaceId,
                    name:
                      stores.get(membership.workspaceId)?.workspace.name ?? '',
                  }
                : null,
              role: membership?.role ?? null,
              twoFactor: Boolean(mfa.get(user.id)?.enabledAt),
              lastSeenAt: latest(signedIn.map((s) => s.lastSeenAt)),
              sessions: signedIn.filter(
                (s) => compareText(s.expiresAt, now) > 0,
              ).length,
            };
          })
          .sort(byMember)
          .slice(0, limit);
      },
      async suspend(workspaceId, reason, at) {
        const store = stores.get(workspaceId);
        if (!store) return false;
        store.suspension = { at, reason };
        for (const [tokenHash, session] of sessions) {
          if (session.workspaceId === workspaceId) sessions.delete(tokenHash);
        }
        return true;
      },
      async restore(workspaceId) {
        const store = stores.get(workspaceId);
        if (!store) return false;
        store.suspension = null;
        return true;
      },
      async remove(workspaceId) {
        if (!stores.delete(workspaceId)) return false;
        const members = memberships
          .filter((m) => m.workspaceId === workspaceId)
          .map((m) => m.userId);
        for (let i = memberships.length - 1; i >= 0; i--) {
          if (memberships[i]!.workspaceId === workspaceId) {
            memberships.splice(i, 1);
          }
        }
        for (const [tokenHash, session] of sessions) {
          if (session.workspaceId === workspaceId) sessions.delete(tokenHash);
        }
        invites = invites.filter((i) => i.workspaceId !== workspaceId);
        grants = grants.filter((g) => g.workspaceId !== workspaceId);
        for (const userId of members) forgetUserIfAlone(userId);
        return true;
      },
    },

    supportGrants: {
      async create(grant) {
        grants.push(structuredClone(grant));
      },
      async get(id) {
        const grant = grants.find((g) => g.id === id);
        return grant ? structuredClone(grant) : null;
      },
      async findByHandoff(handoffHash) {
        const grant = grants.find((g) => g.handoffHash === handoffHash);
        return grant ? structuredClone(grant) : null;
      },
      async findBySession(sessionHash) {
        const grant = grants.find((g) => g.sessionHash === sessionHash);
        return grant ? structuredClone(grant) : null;
      },
      async redeem(id, handoffHash, sessionHash, actingUserId, now) {
        const grant = grants.find(
          (g) =>
            g.id === id &&
            g.handoffHash === handoffHash &&
            compareText(g.handoffExpiresAt, now) > 0 &&
            compareText(g.expiresAt, now) > 0 &&
            g.endedAt === null,
        );
        if (!grant) return false;
        grant.handoffHash = null;
        grant.sessionHash = sessionHash;
        grant.actingUserId = actingUserId;
        grant.openedAt = now;
        return true;
      },
      async setActingUser(id, userId) {
        const grant = grants.find((g) => g.id === id);
        if (grant) grant.actingUserId = userId;
      },
      async list({ workspaceId, liveAt, limit }) {
        return grants
          .filter(
            (g) => workspaceId === undefined || g.workspaceId === workspaceId,
          )
          .filter(
            (g) =>
              liveAt === undefined ||
              (g.endedAt === null && compareText(g.expiresAt, liveAt) > 0),
          )
          .map(publicGrant)
          .sort(byInvite)
          .slice(0, limit);
      },
      async end(id, at, by) {
        const grant = grants.find((g) => g.id === id && g.endedAt === null);
        if (!grant) return false;
        grant.endedAt = at;
        grant.endedBy = by;
        return true;
      },
      async endExpired(now) {
        const ended = grants.filter(
          (g) => g.endedAt === null && compareText(g.expiresAt, now) <= 0,
        );
        for (const grant of ended) {
          grant.endedAt = grant.expiresAt;
          grant.endedBy = 'Its time ran out';
        }
        return structuredClone(ended);
      },
    },

    ping: async () => {},
    close: async () => {},
  };
}
