import { AUDIT_COUNT_GROUPS, type Tool } from '@dossierhq/contracts';
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import type { SupabaseConfig } from '../../config.js';
import { DatabaseError } from '../../errors.js';
import {
  byAsked,
  byAttention,
  byAuditRecency,
  byCommitment,
  byDelivery,
  byDocument,
  byDevice,
  byEvent,
  byInvite,
  byNote,
  byNotification,
  byMeeting,
  byMember,
  byName,
  bySessionRecency,
  byOverview,
  byQuestion,
  byRecommendation,
  byReportWeek,
  byRunRecency,
  bySourceRecency,
  byTicket,
  byTool,
  compareText,
  inIdOrder,
} from '../../ordering.js';
import {
  askChangesRow,
  askRow,
  auditRow,
  clientLinkRow,
  clientRow,
  connectorChangesRow,
  connectorRow,
  contractDocumentRow,
  contractColumns,
  deliveryRow,
  eventRow,
  inviteRow,
  meetingPointsRow,
  noteRow,
  notificationRow,
  patternRows,
  recommendationChangesRow,
  recommendationDraftRow,
  intelligenceRunRow,
  reportQuestionChangesRow,
  reportQuestionRow,
  reportRow,
  recipientRows,
  reportSettingsRow,
  toAskAnswer,
  toAskSummary,
  toAttentionItem,
  toAuditEntry,
  toClient,
  toClientLink,
  toCommitment,
  toConnector,
  toConnectorRecord,
  toContractDocument,
  toDelivery,
  toDevice,
  toEventRecord,
  toInvite,
  toMembership,
  toMfa,
  toMeeting,
  toMeetingPoints,
  toNote,
  toNotification,
  toPattern,
  toIntelligenceRun,
  toRecommendation,
  toReport,
  toRecipient,
  toReportSettings,
  toReportQuestion,
  toReportSummary,
  toSession,
  toSource,
  toTicket,
  sourceRow,
  toolRecordsPayload,
  toUser,
  toUserRecord,
  toWorkspace,
  userRow,
  withPoints,
  workspaceRow,
} from '../../rows.js';
import {
  AUDIT_PAGE_SIZE,
  type DatabaseAdapter,
  type InviteOutcome,
} from '../../types.js';
import type { Database, Json } from './database.types.js';

/** Rows are plain JSON already; this only satisfies supabase-js's types. */
const json = (value: unknown) => value as Json;

export type SupabaseDatabaseClient = ReturnType<typeof createClient<Database>>;

// A literal, so supabase-js can type the rows it returns.
const DOCUMENT =
  'id, client_id, name, content_type, size, uploaded_by, uploaded_by_name, uploaded_at';

const ASKED =
  'id, question, status, answered, asked_by, asked_by_name, clients, asked_at, finished_at';

const SUMMARY =
  'id, client_id, week_start, week_end, status, generated_at, approved_at, exceptions, edited_at, sent_at';

type Result<T> = { data: T | null; error: PostgrestError | null };

async function query<T>(
  action: string,
  request: PromiseLike<Result<T>>,
): Promise<T> {
  const { data, error } = await request;
  if (error) {
    throw new DatabaseError(`Failed to ${action}: ${error.message}`, {
      cause: error,
    });
  }
  return data as T;
}

/** The row count of a `head: true, count: 'exact'` select. */
async function countOf(
  action: string,
  request: PromiseLike<{ count: number | null; error: PostgrestError | null }>,
): Promise<number> {
  const { count, error } = await request;
  if (error) {
    throw new DatabaseError(`Failed to ${action}: ${error.message}`, {
      cause: error,
    });
  }
  return count ?? 0;
}

/** A value inside a PostgREST filter, where `,.:()` would otherwise split it. */
const quoted = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

/**
 * Talks to Supabase through its Data API (PostgREST) with a server-side secret
 * key, which bypasses Row Level Security. Never use this adapter in the
 * browser. Ordering uses the shared rules in ordering.ts so every adapter agrees.
 */
export function createSupabaseAdapter(config: SupabaseConfig): DatabaseAdapter {
  const db = createClient<Database>(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  async function pointsFor(workspaceId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await query(
      'read meeting points',
      db
        .from('meeting_points')
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('id', ids),
    );
    return rows.map(toMeetingPoints);
  }

  /** Meetings or notes with what Claude read from them (rows.withPoints). */
  async function withMeetingPoints<
    T extends Parameters<typeof withPoints>[0] & { id: string },
  >(workspaceId: string, items: T[]) {
    const points = new Map(
      (
        await pointsFor(
          workspaceId,
          items.map((item) => item.id),
        )
      ).map((p) => [p.id, p] as const),
    );
    return items.map((item) => withPoints(item, points.get(item.id)));
  }

  async function clientNames(workspaceId: string) {
    const rows = await query(
      'read client names',
      db.from('clients').select('id, name').eq('workspace_id', workspaceId),
    );
    const names = new Map(rows.map((row) => [row.id, row.name]));
    return (id: string) => names.get(id) ?? id;
  }

  return {
    provider: 'supabase',

    users: {
      async createOwner(workspace, user) {
        return query(
          'create a workspace and its owner',
          db.rpc('create_owner', {
            p_workspace: json(workspaceRow(workspace)),
            p_user: json(userRow(user, new Date().toISOString())),
          }),
        );
      },
      async findByEmail(email) {
        const row = await query(
          'find a user',
          db
            .from('users')
            .select('*')
            .eq('email', email.toLowerCase())
            .maybeSingle(),
        );
        return row ? toUserRecord(row) : null;
      },
      async get(userId) {
        const row = await query(
          'read a user',
          db
            .from('users')
            .select('id, email, name, title')
            .eq('id', userId)
            .maybeSingle(),
        );
        return row ? toUser(row) : null;
      },
      async memberships(userId) {
        const rows = await query(
          'read memberships',
          db.from('workspace_members').select('*').eq('user_id', userId),
        );
        return rows
          .map(toMembership)
          .sort((a, b) => compareText(a.workspaceId, b.workspaceId));
      },
      async setPassword(userId, passwordHash) {
        await query(
          'change a password',
          db
            .from('users')
            .update({ password_hash: passwordHash })
            .eq('id', userId),
        );
      },
      async members(workspaceId) {
        const rows = await query(
          'list members',
          db
            .from('workspace_members')
            .select('role, users (id, email, name, title)')
            .eq('workspace_id', workspaceId),
        );
        return rows
          .flatMap((row) =>
            row.users
              ? [{ ...toUser(row.users), role: toMembership(row).role }]
              : [],
          )
          .sort(byMember);
      },
      async setRole(workspaceId, userId, role) {
        const rows = await query(
          'change a role',
          db
            .from('workspace_members')
            .update({ role })
            .eq('workspace_id', workspaceId)
            .eq('user_id', userId)
            .select('user_id'),
        );
        return rows.length > 0;
      },
      async removeMember(workspaceId, userId) {
        return query(
          'remove a member',
          db.rpc('remove_member', {
            p_workspace_id: workspaceId,
            p_user_id: userId,
          }),
        );
      },
    },

    sessions: {
      async create(session) {
        await query(
          'create a session',
          db.from('sessions').insert({
            token_hash: session.tokenHash,
            user_id: session.userId,
            workspace_id: session.workspaceId,
            created_at: session.createdAt,
            expires_at: session.expiresAt,
            last_seen_at: session.lastSeenAt,
          }),
        );
      },
      async find(tokenHash) {
        const row = await query(
          'read a session',
          db
            .from('sessions')
            .select('*')
            .eq('token_hash', tokenHash)
            .maybeSingle(),
        );
        return row ? toSession(row) : null;
      },
      async delete(tokenHash) {
        await query(
          'end a session',
          db.from('sessions').delete().eq('token_hash', tokenHash),
        );
      },
      async touch(tokenHash, at) {
        await query(
          'note a session’s use',
          db
            .from('sessions')
            .update({ last_seen_at: at })
            .eq('token_hash', tokenHash),
        );
      },
      async listForUser(userId) {
        const rows = await query(
          'list a user’s sessions',
          db.from('sessions').select('*').eq('user_id', userId),
        );
        return rows.map(toSession).sort(bySessionRecency);
      },
      async deleteForUser(userId, except) {
        let request = db.from('sessions').delete().eq('user_id', userId);
        if (except !== undefined) request = request.neq('token_hash', except);
        await query('end a user’s sessions', request);
      },
      async deleteEnded(now, unusedSince) {
        const rows = await query(
          'delete ended sessions',
          db
            .from('sessions')
            .delete()
            .or(
              `expires_at.lte.${quoted(now)},last_seen_at.lt.${quoted(unusedSince)}`,
            )
            .select('token_hash'),
        );
        return rows.length;
      },
    },

    invites: {
      async list(workspaceId) {
        const rows = await query(
          'list invites',
          db.from('invites').select('*').eq('workspace_id', workspaceId),
        );
        return rows.map(toInvite).sort(byInvite);
      },
      async save(workspaceId, invite) {
        await query(
          'save an invite',
          db.from('invites').upsert(inviteRow(workspaceId, invite), {
            onConflict: 'workspace_id,email',
          }),
        );
      },
      async findByToken(tokenHash) {
        const row: ({ workspace_id: string } & Record<string, unknown>) | null =
          await query(
            'find an invite',
            db
              .from('invites')
              .select('*')
              .eq('token_hash', tokenHash)
              .maybeSingle(),
          );
        return row ? { ...toInvite(row), workspaceId: row.workspace_id } : null;
      },
      async remove(workspaceId, id) {
        const rows = await query(
          'withdraw an invite',
          db
            .from('invites')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .select('id'),
        );
        return rows.length > 0;
      },
      async accept(tokenHash, user, now) {
        const outcome = await query(
          'accept an invite',
          db.rpc('accept_invite', {
            p_token_hash: tokenHash,
            p_user: json(userRow(user, now)),
            p_now: now,
          }),
        );
        return outcome as InviteOutcome;
      },
    },

    notes: {
      async list(workspaceId, clientId) {
        const base = db
          .from('meeting_notes')
          .select('*')
          .eq('workspace_id', workspaceId);
        const rows = await query(
          'list notes',
          clientId === null
            ? base.is('client_id', null)
            : base.eq('client_id', clientId),
        );
        return (await withMeetingPoints(workspaceId, rows.map(toNote))).sort(
          byNote,
        );
      },
      async get(workspaceId, id) {
        const row = await query(
          'read notes',
          db
            .from('meeting_notes')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .maybeSingle(),
        );
        if (!row) return null;
        const [note] = await withMeetingPoints(workspaceId, [toNote(row)]);
        return note!;
      },
      async add(workspaceId, note, source) {
        await query(
          'add notes',
          db.rpc('add_meeting_note', {
            p_workspace_id: workspaceId,
            p_note: json(noteRow(workspaceId, note)),
            p_source: source && json(sourceRow(workspaceId, source)),
          }),
        );
      },
      async file(workspaceId, id, clientId, source) {
        const rows = await query(
          'file notes',
          db.rpc('file_meeting_note', {
            p_workspace_id: workspaceId,
            p_id: id,
            p_client_id: clientId as string,
            p_source: source && json(sourceRow(workspaceId, source)),
          }),
        );
        return rows[0] ? toNote(rows[0]) : null;
      },
      async remove(workspaceId, id) {
        const rows = await query(
          'delete notes',
          db
            .from('meeting_notes')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .select('id'),
        );
        return rows.length > 0;
      },
      async inboxToken(workspaceId, fresh, at) {
        await query(
          'read the notes address',
          db
            .from('notes_inboxes')
            .upsert(
              { workspace_id: workspaceId, token: fresh, created_at: at },
              { onConflict: 'workspace_id', ignoreDuplicates: true },
            ),
        );
        const row: { token: string } = await query(
          'read the notes address',
          db
            .from('notes_inboxes')
            .select('token')
            .eq('workspace_id', workspaceId)
            .single(),
        );
        return row.token;
      },
      async inboxWorkspace(token) {
        const workspaceId: string | null = await query(
          'find a notes address',
          db.rpc('notes_inbox_workspace', { p_token: token }),
        );
        return workspaceId ?? null;
      },
    },

    mfa: {
      async get(userId) {
        const row = await query(
          'read two-factor sign-in',
          db.from('user_mfa').select('*').eq('user_id', userId).maybeSingle(),
        );
        return row ? toMfa(row) : null;
      },
      async begin(userId, secret, at) {
        const existing: { enabled_at: string | null } | null = await query(
          'read two-factor sign-in',
          db
            .from('user_mfa')
            .select('enabled_at')
            .eq('user_id', userId)
            .maybeSingle(),
        );
        if (existing?.enabled_at) return false;
        await query(
          'start two-factor setup',
          db.from('user_mfa').upsert({
            user_id: userId,
            secret,
            created_at: at,
            enabled_at: null,
            last_step: null,
            recovery_hashes: [],
          }),
        );
        return true;
      },
      async enable(userId, recoveryHashes, at) {
        const rows = await query(
          'turn on two-factor sign-in',
          db
            .from('user_mfa')
            .update({ enabled_at: at, recovery_hashes: recoveryHashes })
            .eq('user_id', userId)
            .is('enabled_at', null)
            .select('user_id'),
        );
        return rows.length > 0;
      },
      async useStep(userId, step) {
        return query(
          'use a two-factor code',
          db.rpc('use_mfa_step', { p_user_id: userId, p_step: step }),
        );
      },
      async useRecoveryCode(userId, hash) {
        return query(
          'use a recovery code',
          db.rpc('use_recovery_code', { p_user_id: userId, p_hash: hash }),
        );
      },
      async remove(userId) {
        await query(
          'turn off two-factor sign-in',
          db.from('user_mfa').delete().eq('user_id', userId),
        );
      },
    },

    rateLimits: {
      count: (bucket, since) =>
        countOf(
          'count attempts',
          db
            .from('rate_limit_hits')
            .select('id', { count: 'exact', head: true })
            .eq('bucket', bucket)
            .gte('at', since),
        ),
      async hit(bucket, at) {
        await query(
          'note an attempt',
          db.from('rate_limit_hits').insert({ bucket, at }),
        );
      },
      async clear(bucket) {
        await query(
          'clear attempts',
          db.from('rate_limit_hits').delete().eq('bucket', bucket),
        );
      },
      async prune(before) {
        await query(
          'prune attempts',
          db.from('rate_limit_hits').delete().lt('at', before),
        );
      },
    },

    passwordResets: {
      async create(reset) {
        await query(
          'drop unused password resets',
          db
            .from('password_resets')
            .delete()
            .eq('user_id', reset.userId)
            .is('used_at', null),
        );
        await query(
          'save a password reset',
          db.from('password_resets').insert({
            token_hash: reset.tokenHash,
            user_id: reset.userId,
            created_at: reset.createdAt,
            expires_at: reset.expiresAt,
          }),
        );
      },
      async consume(tokenHash, now) {
        // One update, so only one of two racing requests gets the row.
        const rows = await query(
          'use a password reset',
          db
            .from('password_resets')
            .update({ used_at: now })
            .eq('token_hash', tokenHash)
            .is('used_at', null)
            .gt('expires_at', now)
            .select('user_id'),
        );
        return rows[0]?.user_id ?? null;
      },
    },

    workspaces: {
      async get(workspaceId) {
        const row = await query(
          'read the workspace',
          db.from('workspaces').select('*').eq('id', workspaceId).maybeSingle(),
        );
        return row ? toWorkspace(row) : null;
      },
      async create(workspace) {
        await query(
          'create a workspace',
          db.from('workspaces').insert(workspaceRow(workspace)),
        );
      },
    },

    clients: {
      async list(workspaceId) {
        const rows = await query(
          'list clients',
          db.from('clients').select('*').eq('workspace_id', workspaceId),
        );
        return rows.map(toClient).sort(byName);
      },
      async get(workspaceId, clientId) {
        const row = await query(
          'read a client',
          db
            .from('clients')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('id', clientId)
            .maybeSingle(),
        );
        return row ? toClient(row) : null;
      },
      async overview(workspaceId) {
        const [overview, clients] = await Promise.all([
          query(
            'build the clients overview',
            db
              .from('client_overview')
              .select('*')
              .eq('workspace_id', workspaceId),
          ),
          query(
            'list clients',
            db.from('clients').select('*').eq('workspace_id', workspaceId),
          ),
        ]);
        const reportIds = overview.flatMap((row) =>
          row.latest_report_id ? [row.latest_report_id] : [],
        );
        const reports =
          reportIds.length === 0
            ? []
            : await query(
                'read latest reports',
                db
                  .from('reports')
                  .select(SUMMARY)
                  .eq('workspace_id', workspaceId)
                  .in('id', reportIds),
              );
        const summaryById = new Map(
          reports.map((row) => [String(row.id), toReportSummary(row)]),
        );
        const clientById = new Map(
          clients.map((row) => [row.id, toClient(row)]),
        );
        return overview
          .flatMap((row) => {
            const client = row.client_id
              ? clientById.get(row.client_id)
              : undefined;
            if (!client) return [];
            return [
              {
                client,
                attention: {
                  total: row.attention_total ?? 0,
                  critical: row.attention_critical ?? 0,
                  high: row.attention_high ?? 0,
                },
                lastMeetingAt: row.last_meeting_at
                  ? new Date(row.last_meeting_at).toISOString()
                  : null,
                latestReport: row.latest_report_id
                  ? (summaryById.get(row.latest_report_id) ?? null)
                  : null,
              },
            ];
          })
          .sort(byOverview);
      },
      async recent(workspaceId, limit) {
        const rows = await query(
          'list recent clients',
          db
            .from('client_views')
            .select('viewed_at, clients(*)')
            .eq('workspace_id', workspaceId)
            .order('viewed_at', { ascending: false })
            .limit(limit),
        );
        return rows.flatMap((row) =>
          row.clients ? [toClient(row.clients)] : [],
        );
      },
      async recordView(workspaceId, clientId, at) {
        const client = await query(
          'read a client',
          db
            .from('clients')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('id', clientId)
            .maybeSingle(),
        );
        if (!client) return false;
        await query(
          'record a client view',
          db
            .from('client_views')
            .upsert(
              { workspace_id: workspaceId, client_id: clientId, viewed_at: at },
              { onConflict: 'workspace_id,client_id' },
            ),
        );
        return true;
      },
      async setContract(workspaceId, clientId, contract) {
        const row = await query(
          'save a contract',
          db
            .from('clients')
            .update(contractColumns(contract))
            .eq('workspace_id', workspaceId)
            .eq('id', clientId)
            .select('*')
            .maybeSingle(),
        );
        return row ? toClient(row) : null;
      },
      async links(workspaceId) {
        const rows = await query(
          'list client links',
          db.from('client_links').select('*').eq('workspace_id', workspaceId),
        );
        return rows
          .map(toClientLink)
          .sort(
            (a, b) =>
              compareText(a.tool, b.tool) ||
              compareText(a.externalId, b.externalId),
          );
      },
      async sync(workspaceId, tool, { clients, links }, at) {
        await query(
          'save synced clients',
          db.rpc('sync_clients', {
            p_workspace_id: workspaceId,
            p_tool: tool,
            p_clients: json(clients.map((c) => clientRow(workspaceId, c, at))),
            p_links: json(links.map((l) => clientLinkRow(workspaceId, l))),
          }),
        );
      },
    },

    attention: {
      async list(workspaceId, { clientId } = {}) {
        let request = db
          .from('attention_items')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (clientId !== undefined) request = request.eq('client_id', clientId);
        return (await query('list attention items', request))
          .map(toAttentionItem)
          .sort(byAttention);
      },
    },

    recommendations: {
      async list(workspaceId, { clientId, status } = {}) {
        let request = db
          .from('recommendations')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (clientId !== undefined) request = request.eq('client_id', clientId);
        if (status !== undefined) request = request.eq('status', status);
        return (await query('list recommendations', request))
          .map(toRecommendation)
          .sort(byRecommendation);
      },
      async get(workspaceId, id) {
        const row = await query(
          'read a recommendation',
          db
            .from('recommendations')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .maybeSingle(),
        );
        return row ? toRecommendation(row) : null;
      },
      async update(workspaceId, id, changes) {
        const row = recommendationChangesRow(changes);
        if (Object.keys(row).length === 0) return this.get(workspaceId, id);
        const updated = await query(
          'update a recommendation',
          db
            .from('recommendations')
            .update(row)
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .select('*')
            .maybeSingle(),
        );
        return updated ? toRecommendation(updated) : null;
      },
      async replaceDrafts(workspaceId, clientId, runId, drafts) {
        await query(
          'replace recommendation drafts',
          db.rpc('replace_recommendation_drafts', {
            p_workspace_id: workspaceId,
            p_client_id: clientId,
            p_rows: json(
              drafts.map((rec) =>
                recommendationDraftRow(workspaceId, runId, rec),
              ),
            ),
          }),
        );
      },
    },

    commitments: {
      async list(workspaceId, { clientId } = {}) {
        let request = db
          .from('commitments')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (clientId !== undefined) request = request.eq('client_id', clientId);
        return (await query('list commitments', request))
          .map(toCommitment)
          .sort(byCommitment);
      },
    },

    meetings: {
      async list(workspaceId, { clientId } = {}) {
        let request = db
          .from('meetings')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (clientId !== undefined) request = request.eq('client_id', clientId);
        const meetings = (await query('list meetings', request)).map(toMeeting);
        return (await withMeetingPoints(workspaceId, meetings)).sort(byMeeting);
      },
    },

    meetingPoints: {
      states: (workspaceId, ids) => pointsFor(workspaceId, ids),
      async save(workspaceId, clientId, record, excerpts) {
        await query(
          'save meeting points',
          db.rpc('save_meeting_points', {
            p_workspace_id: workspaceId,
            p_client_id: clientId,
            p_points: json(meetingPointsRow(workspaceId, record)),
            p_excerpts:
              excerpts && json(excerpts.map((e) => sourceRow(workspaceId, e))),
          }),
        );
      },
      async prune(workspaceId, now, before) {
        await query(
          'prune meeting points',
          db.rpc('prune_meeting_points', {
            p_workspace_id: workspaceId,
            p_now: now,
            p_before: before,
          }),
        );
      },
    },

    devices: {
      async list(workspaceId, { clientId } = {}) {
        let request = db
          .from('devices')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (clientId !== undefined) request = request.eq('client_id', clientId);
        return (await query('list devices', request))
          .map(toDevice)
          .sort(byDevice);
      },
    },

    tickets: {
      async list(workspaceId, { clientId } = {}) {
        let request = db
          .from('tickets')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (clientId !== undefined) request = request.eq('client_id', clientId);
        return (await query('list tickets', request))
          .map(toTicket)
          .sort(byTicket);
      },
    },

    reports: {
      async listSummaries(workspaceId, { clientId, status } = {}) {
        let request = db
          .from('reports')
          .select(SUMMARY)
          .eq('workspace_id', workspaceId);
        if (clientId !== undefined) request = request.eq('client_id', clientId);
        if (status !== undefined) request = request.eq('status', status);
        const [rows, name] = await Promise.all([
          query('list reports', request),
          clientNames(workspaceId),
        ]);
        return rows.map(toReportSummary).sort(byReportWeek(name));
      },
      async get(workspaceId, id) {
        const row = await query(
          'read a report',
          db
            .from('reports')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .maybeSingle(),
        );
        return row ? toReport(row) : null;
      },
      async save(workspaceId, report) {
        const row = reportRow(workspaceId, report);
        await query(
          'save a report',
          db.from('reports').upsert(
            {
              ...row,
              glance: json(row.glance),
              sections: json(row.sections),
              sources: json(row.sources),
            },
            { onConflict: 'id' },
          ),
        );
      },
      async setStatus(workspaceId, ids, status, at) {
        if (ids.length === 0) return [];
        const rows = await query(
          'update report status',
          db
            .from('reports')
            .update({ status, approved_at: status === 'approved' ? at : null })
            .eq('workspace_id', workspaceId)
            .in('id', ids)
            .is('sent_at', null)
            .select(SUMMARY),
        );
        return inIdOrder(ids, rows.map(toReportSummary));
      },
      async markSent(workspaceId, id, at) {
        const rows = await query(
          'mark a report sent',
          db
            .from('reports')
            .update({ sent_at: at })
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .eq('status', 'approved')
            .is('sent_at', null)
            .select('id'),
        );
        return rows.length > 0;
      },
      async clearSent(workspaceId, id) {
        await query(
          'mark a report unsent',
          db
            .from('reports')
            .update({ sent_at: null })
            .eq('workspace_id', workspaceId)
            .eq('id', id),
        );
      },
    },

    reportSettings: {
      async get(workspaceId) {
        const row = await query(
          'read report settings',
          db
            .from('report_settings')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle(),
        );
        return row ? toReportSettings(row) : null;
      },
      async save(workspaceId, settings) {
        await query(
          'save report settings',
          db
            .from('report_settings')
            .upsert(reportSettingsRow(workspaceId, settings), {
              onConflict: 'workspace_id',
            }),
        );
      },
      async listScheduled() {
        const ids: string[] | null = await query(
          'list report schedules',
          db.rpc('scheduled_report_workspaces'),
        );
        return (ids ?? []).sort(compareText);
      },
      async markDrafted(workspaceId, weekStart) {
        const rows = await query(
          'note the scheduled draft',
          db
            .from('report_settings')
            .update({ drafted_week: weekStart })
            .eq('workspace_id', workspaceId)
            .or(`drafted_week.is.null,drafted_week.neq.${weekStart}`)
            .select('workspace_id'),
        );
        return rows.length > 0;
      },
    },

    recipients: {
      async list(workspaceId, clientId) {
        const rows = await query(
          'list recipients',
          db
            .from('client_recipients')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('client_id', clientId)
            .order('position'),
        );
        return rows.map(toRecipient);
      },
      async replace(workspaceId, clientId, recipients) {
        await query(
          'save recipients',
          db.rpc('replace_client_recipients', {
            p_workspace_id: workspaceId,
            p_client_id: clientId,
            p_rows: json(recipientRows(workspaceId, clientId, recipients)),
          }),
        );
      },
    },

    contractDocuments: {
      async list(workspaceId, clientId) {
        const rows = await query(
          'list contract documents',
          db
            .from('contract_documents')
            .select(DOCUMENT)
            .eq('workspace_id', workspaceId)
            .eq('client_id', clientId),
        );
        return rows.map(toContractDocument).sort(byDocument);
      },
      async get(workspaceId, id) {
        const row = await query(
          'read a contract document',
          db
            .from('contract_documents')
            .select(DOCUMENT)
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .maybeSingle(),
        );
        if (!row) return null;
        // The Data API can't send bytes as they are, so they come as base64.
        const base64: string | null = await query(
          'read a contract document',
          db.rpc('contract_document_content', {
            p_workspace_id: workspaceId,
            p_id: id,
          }),
        );
        return {
          document: toContractDocument(row),
          content: new Uint8Array(Buffer.from(base64 ?? '', 'base64')),
        };
      },
      async add(workspaceId, document, content) {
        await query(
          'save a contract document',
          db.rpc('add_contract_document', {
            p_row: json(contractDocumentRow(workspaceId, document)),
            p_content: Buffer.from(content).toString('base64'),
          }),
        );
      },
      async remove(workspaceId, id) {
        const rows = await query(
          'delete a contract document',
          db
            .from('contract_documents')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .select('id'),
        );
        return rows.length > 0;
      },
    },

    deliveries: {
      async list(workspaceId, reportId) {
        const rows = await query(
          'list report deliveries',
          db
            .from('report_deliveries')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('report_id', reportId),
        );
        return rows.map(toDelivery).sort(byDelivery);
      },
      async add(workspaceId, delivery) {
        await query(
          'record a report delivery',
          db
            .from('report_deliveries')
            .insert(deliveryRow(workspaceId, delivery)),
        );
      },
    },

    reportQuestions: {
      async list(workspaceId, { clientId } = {}) {
        let request = db
          .from('report_questions')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (clientId !== undefined) {
          request = request.or(
            `client_id.is.null,client_id.eq.${quoted(clientId)}`,
          );
        }
        const rows = await query('list report questions', request);
        return rows.map(toReportQuestion).sort(byQuestion);
      },
      async create(workspaceId, question) {
        await query(
          'save a report question',
          db
            .from('report_questions')
            .insert(reportQuestionRow(workspaceId, question)),
        );
      },
      async update(workspaceId, id, changes) {
        const row = reportQuestionChangesRow(changes);
        const request =
          Object.keys(row).length === 0
            ? db
                .from('report_questions')
                .select('*')
                .eq('workspace_id', workspaceId)
                .eq('id', id)
                .maybeSingle()
            : db
                .from('report_questions')
                .update(row)
                .eq('workspace_id', workspaceId)
                .eq('id', id)
                .select('*')
                .maybeSingle();
        const updated = await query('update a report question', request);
        return updated ? toReportQuestion(updated) : null;
      },
      async remove(workspaceId, id) {
        const rows = await query(
          'remove a report question',
          db
            .from('report_questions')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .select('id'),
        );
        return rows.length > 0;
      },
    },

    sources: {
      async getMany(workspaceId, ids) {
        if (ids.length === 0) return [];
        const rows = await query(
          'read sources',
          db
            .from('sources')
            .select('*')
            .eq('workspace_id', workspaceId)
            .in('id', ids),
        );
        return inIdOrder(ids, rows.map(toSource));
      },
      async listForClient(workspaceId, clientId) {
        const rows = await query(
          "list a client's sources",
          db
            .from('sources')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('client_id', clientId),
        );
        return rows.map(toSource).sort(bySourceRecency);
      },
    },

    records: {
      async replace(workspaceId, tool, records) {
        await query(
          `replace ${tool} records`,
          db.rpc('replace_tool_records', {
            p_workspace_id: workspaceId,
            p_tool: tool,
            p_records: json(toolRecordsPayload(workspaceId, tool, records)),
          }),
        );
      },
      async upsert(workspaceId, tool, records) {
        await query(
          `save ${tool} records`,
          db.rpc('upsert_tool_records', {
            p_workspace_id: workspaceId,
            p_tool: tool,
            p_records: json(toolRecordsPayload(workspaceId, tool, records)),
          }),
        );
      },
      async removeTool(workspaceId, tool) {
        await query(
          `remove ${tool} records`,
          db.rpc('remove_tool', { p_workspace_id: workspaceId, p_tool: tool }),
        );
      },
    },

    connectors: {
      async list(workspaceId) {
        const rows = await query(
          'list connectors',
          db.from('connectors').select('*').eq('workspace_id', workspaceId),
        );
        return rows.map(toConnector).sort(byTool);
      },
      async get(workspaceId, tool) {
        const row = await query(
          'read a connector',
          db
            .from('connectors')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('tool', tool)
            .maybeSingle(),
        );
        return row ? toConnectorRecord(row) : null;
      },
      async save(workspaceId, record) {
        const row = connectorRow(workspaceId, record);
        await query(
          'save a connector',
          db
            .from('connectors')
            .upsert(
              { ...row, failure: json(row.failure), state: json(row.state) },
              { onConflict: 'workspace_id,tool' },
            ),
        );
      },
      async update(workspaceId, tool, changes) {
        const row = connectorChangesRow(changes);
        const request =
          Object.keys(row).length === 0
            ? db
                .from('connectors')
                .select('*')
                .eq('workspace_id', workspaceId)
                .eq('tool', tool)
                .maybeSingle()
            : db
                .from('connectors')
                // Exactly the changed columns, from rows.ts.
                .update(
                  row as Database['public']['Tables']['connectors']['Update'],
                )
                .eq('workspace_id', workspaceId)
                .eq('tool', tool)
                .select('*')
                .maybeSingle();
        const updated = await query('update a connector', request);
        return updated ? toConnectorRecord(updated) : null;
      },
      async remove(workspaceId, tool) {
        await query(
          'remove a connector',
          db
            .from('connectors')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('tool', tool),
        );
      },
      async listAll() {
        const rows = await query(
          'list every connector',
          db.from('connectors').select('workspace_id, tool'),
        );
        return rows
          .map((row) => ({
            workspaceId: row.workspace_id,
            tool: row.tool as Tool,
          }))
          .sort(
            (a, b) =>
              compareText(a.workspaceId, b.workspaceId) ||
              compareText(a.tool, b.tool),
          );
      },
    },

    audit: {
      async list(
        workspaceId,
        { kind, tool, clientId, before, after, limit = AUDIT_PAGE_SIZE } = {},
      ) {
        let request = db
          .from('audit_entries')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (kind !== undefined) request = request.eq('kind', kind);
        if (tool !== undefined) request = request.eq('tool', tool);
        if (clientId !== undefined) {
          request = request.or(`client_id.eq.${clientId},client_id.is.null`);
        }
        if (before !== undefined) {
          const at = quoted(before.at);
          request = request.or(
            `at.lt.${at},and(at.eq.${at},id.gt.${quoted(before.id)})`,
          );
        }
        if (after !== undefined) {
          const at = quoted(after.at);
          request = request.or(
            `at.gt.${at},and(at.eq.${at},id.lt.${quoted(after.id)})`,
          );
        }
        const newestFirst = after === undefined;
        const rows = await query(
          'read the audit log',
          request
            .order('at', { ascending: !newestFirst })
            .order('id', { ascending: newestFirst })
            .limit(limit),
        );
        return rows.map(toAuditEntry).sort(byAuditRecency);
      },
      counts: (workspaceId, { clientId } = {}) =>
        Promise.all(
          AUDIT_COUNT_GROUPS.map(async (group) => {
            let request = db
              .from('audit_entries')
              .select('id', { count: 'exact', head: true })
              .eq('workspace_id', workspaceId)
              .eq('kind', group.kind);
            if (group.tool !== null) request = request.eq('tool', group.tool);
            if (clientId !== undefined) {
              request = request.or(
                `client_id.eq.${clientId},client_id.is.null`,
              );
            }
            return {
              ...group,
              count: await countOf('count the audit log', request),
            };
          }),
        ),
      async append(workspaceId, entries) {
        if (entries.length === 0) return;
        await query(
          'write to the audit log',
          db
            .from('audit_entries')
            .insert(entries.map((e) => auditRow(workspaceId, e))),
        );
      },
      async prune(workspaceId, before, kinds) {
        if (kinds.length === 0) return;
        await query(
          'prune the audit log',
          db
            .from('audit_entries')
            .delete()
            .eq('workspace_id', workspaceId)
            .lt('at', before)
            .in('kind', kinds),
        );
      },
    },

    intelligence: {
      async model(workspaceId) {
        const row: { intelligence_model: string | null } | null = await query(
          'read the intelligence model',
          db.from('workspaces').select('*').eq('id', workspaceId).maybeSingle(),
        );
        return row?.intelligence_model ?? null;
      },
      async setModel(workspaceId, model) {
        await query(
          'set the intelligence model',
          db
            .from('workspaces')
            .update({ intelligence_model: model })
            .eq('id', workspaceId),
        );
      },
      async preferences(workspaceId) {
        const row: { intelligence_preferences: unknown } | null = await query(
          'read intelligence preferences',
          db.from('workspaces').select('*').eq('id', workspaceId).maybeSingle(),
        );
        return (row?.intelligence_preferences ?? {}) as Record<string, unknown>;
      },
      async setPreferences(workspaceId, preferences) {
        await query(
          'save intelligence preferences',
          db
            .from('workspaces')
            .update({ intelligence_preferences: json(preferences) })
            .eq('id', workspaceId),
        );
      },
      async lastRun(workspaceId, kind, clientId) {
        let request = db
          .from('intelligence_runs')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('kind', kind);
        request =
          clientId === null
            ? request.is('client_id', null)
            : request.eq('client_id', clientId);
        const rows = await query(
          'read the last intelligence run',
          request.order('started_at', { ascending: false }).limit(5),
        );
        return rows.map(toIntelligenceRun).sort(byRunRecency)[0] ?? null;
      },
      async saveRun(workspaceId, run) {
        const row = intelligenceRunRow(workspaceId, run);
        await query(
          'save an intelligence run',
          db
            .from('intelligence_runs')
            .upsert({ ...row, usage: json(row.usage) }, { onConflict: 'id' }),
        );
      },
      async runs(workspaceId, since) {
        const rows = await query(
          'list intelligence runs',
          db
            .from('intelligence_runs')
            .select('*')
            .eq('workspace_id', workspaceId)
            .gte('started_at', since),
        );
        return rows.map(toIntelligenceRun).sort(byRunRecency);
      },
    },

    ask: {
      async list(workspaceId, { askedBy, limit }) {
        let request = db
          .from('ask_answers')
          .select(ASKED)
          .eq('workspace_id', workspaceId);
        if (askedBy !== undefined) request = request.eq('asked_by', askedBy);
        const rows = await query(
          'list questions asked',
          request
            .order('asked_at', { ascending: false })
            .order('id')
            .limit(limit),
        );
        return rows.map(toAskSummary).sort(byAsked);
      },
      async get(workspaceId, id) {
        const row = await query(
          'read an answer',
          db
            .from('ask_answers')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .maybeSingle(),
        );
        return row ? toAskAnswer(row) : null;
      },
      async create(workspaceId, answer) {
        const row = askRow(workspaceId, answer);
        await query(
          'save a question',
          db.from('ask_answers').insert({
            ...row,
            clients: json(row.clients),
            lines: json(row.lines),
            sources: json(row.sources),
          }),
        );
      },
      async update(workspaceId, id, changes) {
        const { clients, lines, sources, ...rest } = askChangesRow(changes);
        const row = {
          ...rest,
          ...(clients !== undefined && { clients: json(clients) }),
          ...(lines !== undefined && { lines: json(lines) }),
          ...(sources !== undefined && { sources: json(sources) }),
        };
        if (Object.keys(row).length === 0) return false;
        const rows = await query(
          'save an answer',
          db
            .from('ask_answers')
            .update(row)
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .eq('status', 'answering')
            .select('id'),
        );
        return rows.length > 0;
      },
      async remove(workspaceId, id) {
        const rows = await query(
          'delete an answer',
          db
            .from('ask_answers')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .select('id'),
        );
        return rows.length > 0;
      },
    },

    patterns: {
      async list(workspaceId) {
        const rows = await query(
          'list patterns',
          db
            .from('patterns')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('position'),
        );
        return rows.map(toPattern);
      },
      async replace(workspaceId, patterns) {
        await query(
          'save patterns',
          db.rpc('replace_patterns', {
            p_workspace_id: workspaceId,
            p_patterns: json(patternRows(workspaceId, patterns)),
          }),
        );
      },
    },

    events: {
      async append(workspaceId, event) {
        const rows = await query(
          'record an event',
          db
            .from('events')
            .upsert(
              {
                ...eventRow(workspaceId, event),
                payload: json(event.payload),
              },
              { onConflict: 'workspace_id,dedupe_key', ignoreDuplicates: true },
            )
            .select('id'),
        );
        return rows.length > 0;
      },
      async claim(now, until, limit) {
        const rows = await query(
          'claim events',
          db.rpc('claim_events', {
            p_now: now,
            p_until: until,
            p_limit: limit,
          }),
        );
        return (rows ?? []).map(toEventRecord).sort(byEvent);
      },
      async markDispatched(workspaceId, id, at) {
        await query(
          'mark an event dispatched',
          db
            .from('events')
            .update({ dispatched_at: at, locked_until: null })
            .eq('workspace_id', workspaceId)
            .eq('id', id),
        );
      },
      async retry(workspaceId, id, nextAttemptAt, error) {
        await query(
          'put an event back',
          db
            .from('events')
            .update({
              next_attempt_at: nextAttemptAt,
              locked_until: null,
              last_error: error,
            })
            .eq('workspace_id', workspaceId)
            .eq('id', id),
        );
      },
      async markFailed(workspaceId, id, at, error) {
        await query(
          'give up on an event',
          db
            .from('events')
            .update({ failed_at: at, locked_until: null, last_error: error })
            .eq('workspace_id', workspaceId)
            .eq('id', id),
        );
      },
      async prune(workspaceId, before) {
        await query(
          'prune events',
          db
            .from('events')
            .delete()
            .eq('workspace_id', workspaceId)
            .lt('occurred_at', before)
            .or('dispatched_at.not.is.null,failed_at.not.is.null'),
        );
      },
    },

    notifications: {
      async add(workspaceId, notifications) {
        if (notifications.length === 0) return;
        await query(
          'add notifications',
          db.from('notifications').upsert(
            notifications.map((n) => notificationRow(workspaceId, n)),
            { onConflict: 'event_id,user_id', ignoreDuplicates: true },
          ),
        );
      },
      async forEvent(workspaceId, eventId) {
        const rows = await query(
          'read an event’s notifications',
          db
            .from('notifications')
            .select('*')
            .eq('workspace_id', workspaceId)
            .eq('event_id', eventId),
        );
        return rows.map(toNotification).sort(byNotification);
      },
      async list(workspaceId, userId, { before, unread, limit = 30 } = {}) {
        let request = db
          .from('notifications')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('user_id', userId)
          .eq('in_app', true);
        if (unread) request = request.is('read_at', null);
        if (before !== undefined) {
          const at = quoted(before.at);
          request = request.or(
            `created_at.lt.${at},and(created_at.eq.${at},id.gt.${quoted(before.id)})`,
          );
        }
        const rows = await query(
          'list notifications',
          request
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .limit(limit),
        );
        return rows.map(toNotification).sort(byNotification);
      },
      countUnread: (workspaceId, userId) =>
        countOf(
          'count unread notifications',
          db
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('user_id', userId)
            .eq('in_app', true)
            .is('read_at', null),
        ),
      async markRead(workspaceId, userId, ids, at) {
        if (ids !== 'all' && ids.length === 0) return 0;
        let request = db
          .from('notifications')
          .update({ read_at: at })
          .eq('workspace_id', workspaceId)
          .eq('user_id', userId)
          .eq('in_app', true)
          .is('read_at', null);
        if (ids !== 'all') request = request.in('id', ids);
        const rows = await query(
          'mark notifications read',
          request.select('id'),
        );
        return rows.length;
      },
      async claimEmail(workspaceId, id, at, staleBefore) {
        const rows = await query(
          'claim a notification email',
          db
            .from('notifications')
            .update({ email_claimed_at: at })
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .eq('email', true)
            .is('email_sent_at', null)
            .or(
              `email_claimed_at.is.null,email_claimed_at.lt.${quoted(staleBefore)}`,
            )
            .select('id'),
        );
        return rows.length > 0;
      },
      async markEmailed(workspaceId, id, at) {
        await query(
          'mark a notification emailed',
          db
            .from('notifications')
            .update({ email_sent_at: at })
            .eq('workspace_id', workspaceId)
            .eq('id', id),
        );
      },
      async releaseEmail(workspaceId, id) {
        await query(
          'release a notification email',
          db
            .from('notifications')
            .update({ email_claimed_at: null })
            .eq('workspace_id', workspaceId)
            .eq('id', id)
            .is('email_sent_at', null),
        );
      },
      async prune(workspaceId, before) {
        await query(
          'prune notifications',
          db
            .from('notifications')
            .delete()
            .eq('workspace_id', workspaceId)
            .lt('created_at', before),
        );
      },
      async preferences(workspaceId) {
        const rows = await query(
          'read notification preferences',
          db
            .from('workspace_members')
            .select('user_id, notification_preferences')
            .eq('workspace_id', workspaceId)
            .not('notification_preferences', 'is', null),
        );
        return Object.fromEntries(
          rows.map((row) => [row.user_id, row.notification_preferences]),
        );
      },
      async setPreferences(workspaceId, userId, preferences) {
        const rows = await query(
          'save notification preferences',
          db
            .from('workspace_members')
            .update({ notification_preferences: json(preferences) })
            .eq('workspace_id', workspaceId)
            .eq('user_id', userId)
            .select('user_id'),
        );
        return rows.length > 0;
      },
    },

    async ping() {
      await query(
        'reach Supabase',
        db.from('workspaces').select('id', { head: true }).limit(1),
      );
    },
    async close() {
      await db.removeAllChannels();
    },
  };
}
