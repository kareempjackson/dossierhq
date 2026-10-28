import { toolSchema, type Tool } from '@dossierhq/contracts';
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import type { SupabaseConfig } from '../../config.js';
import { DatabaseError } from '../../errors.js';
import {
  byAttention,
  byAuditRecency,
  byCommitment,
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
  compareText,
  inIdOrder,
} from '../../ordering.js';
import {
  auditRow,
  clientLinkRow,
  clientRow,
  connectorChangesRow,
  connectorRow,
  recommendationChangesRow,
  recommendationDraftRow,
  intelligenceRunRow,
  reportQuestionChangesRow,
  reportQuestionRow,
  reportRow,
  toAttentionItem,
  toAuditEntry,
  toClient,
  toClientLink,
  toCommitment,
  toConnector,
  toConnectorRecord,
  toDevice,
  toMembership,
  toMeeting,
  toIntelligenceRun,
  toRecommendation,
  toReport,
  toReportQuestion,
  toReportSummary,
  toSession,
  toSource,
  toTicket,
  toolRecordsPayload,
  toUser,
  toUserRecord,
  toWorkspace,
  userRow,
  workspaceRow,
} from '../../rows.js';
import { AUDIT_PAGE_SIZE, type DatabaseAdapter } from '../../types.js';
import type { Database, Json } from './database.types.js';

/** Rows are plain JSON already; this only satisfies supabase-js's types. */
const json = (value: unknown) => value as Json;

export type SupabaseDatabaseClient = ReturnType<typeof createClient<Database>>;

// A literal, so supabase-js can type the rows it returns.
const SUMMARY =
  'id, client_id, week_start, week_end, status, generated_at, approved_at, exceptions';

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
        return (await query('list meetings', request))
          .map(toMeeting)
          .sort(byMeeting);
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
            .select(SUMMARY),
        );
        return inIdOrder(ids, rows.map(toReportSummary));
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
        { tool, clientId, before, after, limit = AUDIT_PAGE_SIZE } = {},
      ) {
        let request = db
          .from('audit_entries')
          .select('*')
          .eq('workspace_id', workspaceId);
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
          toolSchema.options.map(async (tool) => {
            let request = db
              .from('audit_entries')
              .select('id', { count: 'exact', head: true })
              .eq('workspace_id', workspaceId)
              .eq('tool', tool);
            if (clientId !== undefined) {
              request = request.or(
                `client_id.eq.${clientId},client_id.is.null`,
              );
            }
            return {
              tool,
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
      async prune(workspaceId, before) {
        await query(
          'prune the audit log',
          db
            .from('audit_entries')
            .delete()
            .eq('workspace_id', workspaceId)
            .lt('at', before),
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
