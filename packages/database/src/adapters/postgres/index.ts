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
  recommendationChangesRow,
  REPORT_SUMMARY_COLUMNS,
  toAttentionItem,
  toAuditEntry,
  toClient,
  toCommitment,
  toConnector,
  toDevice,
  toMeeting,
  toRecommendation,
  toReport,
  toReportSummary,
  toSource,
  toWorkspace,
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

    workspaces: {
      get: (workspaceId) =>
        run('read the workspace', async () => {
          const [row] =
            await sql`select * from workspaces where id = ${workspaceId}`;
          return row ? toWorkspace(row) : null;
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

    connectors: {
      list: (workspaceId) =>
        run('list connectors', async () =>
          (
            await sql`select * from connectors where workspace_id = ${workspaceId}`
          )
            .map(toConnector)
            .sort(byTool),
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
    },

    async ping() {
      await run('reach Postgres', () => sql`select 1 from workspaces limit 1`);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
