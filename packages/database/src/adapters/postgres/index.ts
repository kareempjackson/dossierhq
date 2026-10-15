import type { Tool } from '@dossierhq/contracts';
import postgres from 'postgres';
import type { PostgresConfig } from '../../config.js';
import { DatabaseError } from '../../errors.js';
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
  inIdOrder,
} from '../../ordering.js';
import {
  auditRow,
  clientLinkRow,
  clientRow,
  connectorChangesRow,
  connectorRow,
  recommendationChangesRow,
  REPORT_SUMMARY_COLUMNS,
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
  toRecommendation,
  toReport,
  toReportSummary,
  toSession,
  toSource,
  toolRecordsPayload,
  toUser,
  toUserRecord,
  toWorkspace,
  userRow,
  workspaceRow,
} from '../../rows.js';
import { AUDIT_PAGE_SIZE, type DatabaseAdapter } from '../../types.js';

/**
 * Plain SQL over a Postgres connection string. Works with Supabase (direct or
 * pooled connection), Neon, RDS, Cloud SQL, or a local Postgres, using the
 * schema in `supabase/migrations`. Filters run in SQL; ordering uses the shared
 * rules in ordering.ts so every adapter agrees.
 */
export function createPostgresAdapter(config: PostgresConfig): DatabaseAdapter {
  const sql = postgres(config.url, {
    max: config.maxConnections ?? 10,
    prepare: config.preparedStatements ?? true,
    onnotice: () => {},
  });

  async function run<T>(action: string, query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (error) {
      throw new DatabaseError(
        `Failed to ${action}: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
  }

  /** postgres.js needs JSON values marked as such. */
  const withJson = (row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row).map(([column, value]) => [
        column,
        (column === 'failure' || column === 'state') && value !== null
          ? sql.json(value as postgres.JSONValue)
          : value,
      ]),
    ) as Record<string, postgres.ParameterOrJSON<never>>;

  const clientFilter = (clientId?: string) =>
    clientId === undefined ? sql`` : sql`and client_id = ${clientId}`;

  async function clientNames(workspaceId: string) {
    const rows =
      await sql`select id, name from clients where workspace_id = ${workspaceId}`;
    const names = new Map(
      rows.map((row) => [String(row.id), String(row.name)]),
    );
    return (id: string) => names.get(id) ?? id;
  }

  return {
    provider: 'postgres',

    users: {
      any: () =>
        run('check for users', async () => {
          const [row] = await sql`select exists (select 1 from users) as any`;
          return Boolean(row?.any);
        }),
      createFirstOwner: (workspace, user) =>
        run('create the first owner', async () => {
          const [row] = await sql`
            select create_first_owner(
              ${sql.json(workspaceRow(workspace))},
              ${sql.json(userRow(user, new Date().toISOString()))},
              'owner'
            ) as created
          `;
          return Boolean(row?.created);
        }),
      findByEmail: (email) =>
        run('find a user', async () => {
          const [row] =
            await sql`select * from users where email = ${email.toLowerCase()}`;
          return row ? toUserRecord(row) : null;
        }),
      get: (userId) =>
        run('read a user', async () => {
          const [row] = await sql`select * from users where id = ${userId}`;
          return row ? toUser(row) : null;
        }),
      memberships: (userId) =>
        run('read memberships', async () =>
          (
            await sql`
              select * from workspace_members where user_id = ${userId}
              order by workspace_id collate "C"
            `
          ).map(toMembership),
        ),
    },

    sessions: {
      create: (session) =>
        run('create a session', async () => {
          await sql`
            insert into sessions (token_hash, user_id, workspace_id, created_at, expires_at)
            values (${session.tokenHash}, ${session.userId}, ${session.workspaceId},
                    ${session.createdAt}, ${session.expiresAt})
          `;
        }),
      find: (tokenHash) =>
        run('read a session', async () => {
          const [row] =
            await sql`select * from sessions where token_hash = ${tokenHash}`;
          return row ? toSession(row) : null;
        }),
      delete: (tokenHash) =>
        run('end a session', async () => {
          await sql`delete from sessions where token_hash = ${tokenHash}`;
        }),
    },

    workspaces: {
      get: (workspaceId) =>
        run('read the workspace', async () => {
          const [row] =
            await sql`select * from workspaces where id = ${workspaceId}`;
          return row ? toWorkspace(row) : null;
        }),
      create: (workspace) =>
        run('create a workspace', async () => {
          await sql`insert into workspaces ${sql(workspaceRow(workspace))}`;
        }),
    },

    clients: {
      list: (workspaceId) =>
        run('list clients', async () =>
          (await sql`select * from clients where workspace_id = ${workspaceId}`)
            .map(toClient)
            .sort(byName),
        ),
      get: (workspaceId, clientId) =>
        run('read a client', async () => {
          const [row] = await sql`
            select * from clients where workspace_id = ${workspaceId} and id = ${clientId}
          `;
          return row ? toClient(row) : null;
        }),
      overview: (workspaceId) =>
        run('build the clients overview', async () => {
          const rows = await sql`
            select c.*, o.attention_total, o.attention_critical, o.attention_high,
                   o.last_meeting_at, o.latest_report_id
            from clients c
            join client_overview o on o.client_id = c.id
            where c.workspace_id = ${workspaceId}
          `;
          const reportIds = rows.flatMap((row) =>
            row.latest_report_id ? [String(row.latest_report_id)] : [],
          );
          const reports =
            reportIds.length === 0
              ? []
              : await sql`
                  select ${sql(REPORT_SUMMARY_COLUMNS)} from reports
                  where workspace_id = ${workspaceId} and id in ${sql(reportIds)}
                `;
          const summaryById = new Map(
            reports.map((row) => [String(row.id), toReportSummary(row)]),
          );
          return rows
            .map((row) => ({
              client: toClient(row),
              attention: {
                total: Number(row.attention_total),
                critical: Number(row.attention_critical),
                high: Number(row.attention_high),
              },
              lastMeetingAt: row.last_meeting_at
                ? new Date(row.last_meeting_at).toISOString()
                : null,
              latestReport:
                summaryById.get(String(row.latest_report_id)) ?? null,
            }))
            .sort(byOverview);
        }),
      recent: (workspaceId, limit) =>
        run('list recent clients', async () =>
          (
            await sql`
              select c.* from client_views v
              join clients c on c.id = v.client_id
              where v.workspace_id = ${workspaceId}
              order by v.viewed_at desc
              limit ${limit}
            `
          ).map(toClient),
        ),
      recordView: (workspaceId, clientId, at) =>
        run('record a client view', async () => {
          const [client] = await sql`
            select 1 from clients where workspace_id = ${workspaceId} and id = ${clientId}
          `;
          if (!client) return false;
          await sql`
            insert into client_views (workspace_id, client_id, viewed_at)
            values (${workspaceId}, ${clientId}, ${at})
            on conflict (workspace_id, client_id) do update set viewed_at = excluded.viewed_at
          `;
          return true;
        }),
      links: (workspaceId) =>
        run('list client links', async () =>
          (
            await sql`
              select * from client_links where workspace_id = ${workspaceId}
              order by tool collate "C", external_id collate "C"
            `
          ).map(toClientLink),
        ),
      sync: (workspaceId, tool, { clients, links }, at) =>
        run('save synced clients', async () => {
          await sql`
            select sync_clients(
              ${workspaceId},
              ${tool},
              ${sql.json(clients.map((c) => clientRow(workspaceId, c, at)))},
              ${sql.json(links.map((l) => clientLinkRow(workspaceId, l)))}
            )
          `;
        }),
    },

    attention: {
      list: (workspaceId, { clientId } = {}) =>
        run('list attention items', async () =>
          (
            await sql`
              select * from attention_items
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
            `
          )
            .map(toAttentionItem)
            .sort(byAttention),
        ),
    },

    recommendations: {
      list: (workspaceId, { clientId, status } = {}) =>
        run('list recommendations', async () =>
          (
            await sql`
              select * from recommendations
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
              ${status === undefined ? sql`` : sql`and status = ${status}`}
            `
          )
            .map(toRecommendation)
            .sort(byRecommendation),
        ),
      get: (workspaceId, id) =>
        run('read a recommendation', async () => {
          const [row] = await sql`
            select * from recommendations where workspace_id = ${workspaceId} and id = ${id}
          `;
          return row ? toRecommendation(row) : null;
        }),
      update: (workspaceId, id, changes) =>
        run('update a recommendation', async () => {
          const row = recommendationChangesRow(changes);
          if (Object.keys(row).length === 0) {
            const [current] = await sql`
              select * from recommendations where workspace_id = ${workspaceId} and id = ${id}
            `;
            return current ? toRecommendation(current) : null;
          }
          const [updated] = await sql`
            update recommendations set ${sql(row)}
            where workspace_id = ${workspaceId} and id = ${id}
            returning *
          `;
          return updated ? toRecommendation(updated) : null;
        }),
    },

    commitments: {
      list: (workspaceId, { clientId } = {}) =>
        run('list commitments', async () =>
          (
            await sql`
              select * from commitments
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
            `
          )
            .map(toCommitment)
            .sort(byCommitment),
        ),
    },

    meetings: {
      list: (workspaceId, { clientId } = {}) =>
        run('list meetings', async () =>
          (
            await sql`
              select * from meetings
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
            `
          )
            .map(toMeeting)
            .sort(byMeeting),
        ),
    },

    devices: {
      list: (workspaceId, { clientId } = {}) =>
        run('list devices', async () =>
          (
            await sql`
              select * from devices
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
            `
          )
            .map(toDevice)
            .sort(byDevice),
        ),
    },

    reports: {
      listSummaries: (workspaceId, { clientId, status } = {}) =>
        run('list reports', async () => {
          const [rows, name] = await Promise.all([
            sql`
              select ${sql(REPORT_SUMMARY_COLUMNS)} from reports
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
              ${status === undefined ? sql`` : sql`and status = ${status}`}
            `,
            clientNames(workspaceId),
          ]);
          return rows.map(toReportSummary).sort(byReportWeek(name));
        }),
      get: (workspaceId, id) =>
        run('read a report', async () => {
          const [row] = await sql`
            select * from reports where workspace_id = ${workspaceId} and id = ${id}
          `;
          return row ? toReport(row) : null;
        }),
      setStatus: (workspaceId, ids, status, at) =>
        run('update report status', async () => {
          if (ids.length === 0) return [];
          const rows = await sql`
            update reports
            set status = ${status}, approved_at = ${status === 'approved' ? at : null}
            where workspace_id = ${workspaceId} and id in ${sql(ids)}
            returning ${sql(REPORT_SUMMARY_COLUMNS)}
          `;
          return inIdOrder(ids, rows.map(toReportSummary));
        }),
    },

    sources: {
      getMany: (workspaceId, ids) =>
        run('read sources', async () => {
          if (ids.length === 0) return [];
          const rows = await sql`
            select * from sources where workspace_id = ${workspaceId} and id in ${sql(ids)}
          `;
          return inIdOrder(ids, rows.map(toSource));
        }),
      listForClient: (workspaceId, clientId) =>
        run("list a client's sources", async () =>
          (
            await sql`
              select * from sources where workspace_id = ${workspaceId} and client_id = ${clientId}
            `
          )
            .map(toSource)
            .sort(bySourceRecency),
        ),
    },

    records: {
      replace: (workspaceId, tool, records) =>
        run(`replace ${tool} records`, async () => {
          await sql`
            select replace_tool_records(
              ${workspaceId}, ${tool},
              ${sql.json(toolRecordsPayload(workspaceId, tool, records))}
            )
          `;
        }),
      upsert: (workspaceId, tool, records) =>
        run(`save ${tool} records`, async () => {
          await sql`
            select upsert_tool_records(
              ${workspaceId}, ${tool},
              ${sql.json(toolRecordsPayload(workspaceId, tool, records))}
            )
          `;
        }),
      removeTool: (workspaceId, tool) =>
        run(`remove ${tool} records`, async () => {
          await sql`select remove_tool(${workspaceId}, ${tool})`;
        }),
    },

    connectors: {
      list: (workspaceId) =>
        run('list connectors', async () =>
          (
            await sql`select * from connectors where workspace_id = ${workspaceId}`
          )
            .map(toConnector)
            .sort(byTool),
        ),
      get: (workspaceId, tool) =>
        run('read a connector', async () => {
          const [row] = await sql`
            select * from connectors where workspace_id = ${workspaceId} and tool = ${tool}
          `;
          return row ? toConnectorRecord(row) : null;
        }),
      save: (workspaceId, record) =>
        run('save a connector', async () => {
          const row = withJson(connectorRow(workspaceId, record));
          await sql`
            insert into connectors ${sql(row)}
            on conflict (workspace_id, tool) do update set ${sql(row)}
          `;
        }),
      update: (workspaceId, tool, changes) =>
        run('update a connector', async () => {
          const row = withJson(connectorChangesRow(changes));
          const [updated] =
            Object.keys(row).length === 0
              ? await sql`
                  select * from connectors where workspace_id = ${workspaceId} and tool = ${tool}
                `
              : await sql`
                  update connectors set ${sql(row)}
                  where workspace_id = ${workspaceId} and tool = ${tool}
                  returning *
                `;
          return updated ? toConnectorRecord(updated) : null;
        }),
      remove: (workspaceId, tool) =>
        run('remove a connector', async () => {
          await sql`delete from connectors where workspace_id = ${workspaceId} and tool = ${tool}`;
        }),
      listAll: () =>
        run('list every connector', async () =>
          (
            await sql`
              select workspace_id, tool from connectors
              order by workspace_id collate "C", tool collate "C"
            `
          ).map((row) => ({
            workspaceId: String(row.workspace_id),
            tool: String(row.tool) as Tool,
          })),
        ),
    },

    audit: {
      list: (workspaceId, { tool, clientId } = {}) =>
        run('read the audit log', async () =>
          (
            await sql`
              select * from audit_entries
              where workspace_id = ${workspaceId}
              ${tool === undefined ? sql`` : sql`and tool = ${tool}`}
              ${clientId === undefined ? sql`` : sql`and (client_id = ${clientId} or client_id is null)`}
              order by at desc, id collate "C"
              limit ${AUDIT_PAGE_SIZE}
            `
          )
            .map(toAuditEntry)
            .sort(byAuditRecency),
        ),
      append: (workspaceId, entries) =>
        run('write to the audit log', async () => {
          if (entries.length === 0) return;
          await sql`insert into audit_entries ${sql(entries.map((e) => auditRow(workspaceId, e)))}`;
        }),
      prune: (workspaceId, before) =>
        run('prune the audit log', async () => {
          await sql`delete from audit_entries where workspace_id = ${workspaceId} and at < ${before}`;
        }),
    },

    async ping() {
      await run('reach Postgres', () => sql`select 1 from workspaces limit 1`);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
