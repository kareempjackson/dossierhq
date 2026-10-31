import {
  AUDIT_COUNT_GROUPS,
  type AuditKind,
  type Tool,
} from '@dossierhq/contracts';
import postgres from 'postgres';
import type { PostgresConfig } from '../../config.js';
import { DatabaseError } from '../../errors.js';
import {
  byAsked,
  byAttention,
  byAuditRecency,
  byCommitment,
  byDelivery,
  byDevice,
  byDocument,
  byEvent,
  byInvite,
  byMeeting,
  byMember,
  byName,
  byNote,
  byNewestWorkspace,
  byNotification,
  bySessionRecency,
  byOverview,
  byQuestion,
  byRecommendation,
  byReportWeek,
  byRunRecency,
  bySourceRecency,
  byTicket,
  byTool,
  inAuditGroup,
  inIdOrder,
} from '../../ordering.js';
import {
  ASK_SUMMARY_COLUMNS,
  askChangesRow,
  askRow,
  auditRow,
  clientLinkRow,
  clientRow,
  connectorChangesRow,
  connectorRow,
  CONTRACT_DOCUMENT_COLUMNS,
  contractColumns,
  contractDocumentRow,
  deliveryRow,
  eventRow,
  inviteRow,
  meetingPointsRow,
  noteRow,
  notificationRow,
  patternRows,
  sourceRow,
  staffAuditRow,
  staffInviteRow,
  staffRow,
  staffSessionRow,
  supportGrantRow,
  recommendationChangesRow,
  recommendationDraftRow,
  intelligenceRunRow,
  REPORT_SUMMARY_COLUMNS,
  reportQuestionChangesRow,
  recipientRows,
  reportQuestionRow,
  reportRow,
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
  toPlatformPerson,
  toIntelligenceRun,
  toRecipient,
  toRecommendation,
  toReport,
  toReportQuestion,
  toReportSettings,
  toReportSummary,
  toAccountSetup,
  toSession,
  toSignUp,
  toSource,
  toStaff,
  toStaffAuditEntry,
  toStaffInvite,
  toStaffRecord,
  toStaffSession,
  toSupportGrant,
  toSupportGrantRecord,
  toTicket,
  toolRecordsPayload,
  toUser,
  withPoints,
  toUserRecord,
  toWorkspace,
  signUpRow,
  toWorkspaceSummary,
  userRow,
  workspaceRow,
} from '../../rows.js';
import {
  AUDIT_PAGE_SIZE,
  type DatabaseAdapter,
  type InviteOutcome,
  type SignUpOutcome,
} from '../../types.js';

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

  /**
   * Runs `query` for one workspace, in a transaction that first sets
   * app.workspace_id. Connected as dossier_app, row level security then lets
   * it see and change only that workspace's rows (20261028230000_tenant_rls);
   * as the owner it changes nothing. Every workspace query runs this way, so
   * both connections behave the same.
   */
  function scoped<T>(
    workspaceId: string,
    action: string,
    query: (sql: postgres.TransactionSql) => Promise<T>,
  ): Promise<T> {
    return run(
      action,
      async () =>
        (await sql.begin(async (tx) => {
          await tx`select set_config('app.workspace_id', ${workspaceId}, true)`;
          return query(tx);
        })) as T,
    );
  }

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

  function pointsFor(
    sql: postgres.TransactionSql,
    workspaceId: string,
    ids: string[],
  ) {
    if (ids.length === 0) return Promise.resolve([]);
    return sql`
      select * from meeting_points
      where workspace_id = ${workspaceId} and id in ${sql(ids)}
    `;
  }

  /** Meetings or notes with what Claude read from them (rows.withPoints). */
  async function withMeetingPoints<
    T extends Parameters<typeof withPoints>[0] & { id: string },
  >(sql: postgres.TransactionSql, workspaceId: string, items: T[]) {
    const rows = await pointsFor(
      sql,
      workspaceId,
      items.map((item) => item.id),
    );
    const points = new Map(
      rows.map(toMeetingPoints).map((p) => [p.id, p] as const),
    );
    return items.map((item) => withPoints(item, points.get(item.id)));
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

  /** The same, for the JSON columns of ask_answers. */
  const asJson = (row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row).map(([column, value]) => [
        column,
        ['clients', 'lines', 'sources'].includes(column)
          ? sql.json(value as postgres.JSONValue)
          : value,
      ]),
    ) as Record<string, postgres.ParameterOrJSON<never>>;

  const clientFilter = (clientId?: string) =>
    clientId === undefined ? sql`` : sql`and client_id = ${clientId}`;

  async function clientNames(
    sql: postgres.TransactionSql,
    workspaceId: string,
  ) {
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
      setPassword: (userId, passwordHash) =>
        run('change a password', async () => {
          await sql`update users set password_hash = ${passwordHash} where id = ${userId}`;
        }),
      setProfile: (userId, { name, title }) =>
        run('change a name', async () => {
          await sql`update users set name = ${name}, title = ${title} where id = ${userId}`;
        }),
      setup: (userId) =>
        run('read how far setup is', async () => {
          const [row] = await sql`
            select u.onboarded_at, u.two_factor_required, m.enabled_at
            from users u left join user_mfa m on m.user_id = u.id
            where u.id = ${userId}
          `;
          return row ? toAccountSetup(row) : null;
        }),
      finishOnboarding: (userId, at, twoFactorRequired) =>
        run('finish onboarding', async () => {
          await sql`
            update users
            set onboarded_at = ${at}, two_factor_required = ${twoFactorRequired}
            where id = ${userId}
          `;
        }),
      members: (workspaceId) =>
        scoped(workspaceId, 'list members', async (sql) =>
          (
            await sql`
              select u.id, u.email, u.name, u.title, m.role
              from workspace_members m join users u on u.id = m.user_id
              where m.workspace_id = ${workspaceId}
            `
          )
            .map((row) => ({ ...toUser(row), role: toMembership(row).role }))
            .sort(byMember),
        ),
      setRole: (workspaceId, userId, role) =>
        scoped(workspaceId, 'change a role', async (sql) => {
          const rows = await sql`
            update workspace_members set role = ${role}
            where workspace_id = ${workspaceId} and user_id = ${userId}
            returning user_id
          `;
          return rows.length > 0;
        }),
      removeMember: (workspaceId, userId) =>
        scoped(workspaceId, 'remove a member', async (sql) => {
          const [row] = await sql`
            select remove_member(${workspaceId}, ${userId}) as removed
          `;
          return Boolean(row?.removed);
        }),
    },

    sessions: {
      create: (session) =>
        run('create a session', async () => {
          await sql`
            insert into sessions (token_hash, user_id, workspace_id, created_at, expires_at, last_seen_at)
            values (${session.tokenHash}, ${session.userId}, ${session.workspaceId},
                    ${session.createdAt}, ${session.expiresAt}, ${session.lastSeenAt})
          `;
        }),
      find: (tokenHash) =>
        run('read a session', async () => {
          const [row] = await sql`select * from find_session(${tokenHash})`;
          return row
            ? {
                ...toSession(row),
                workspaceSuspended: Boolean(row.workspace_suspended),
              }
            : null;
        }),
      delete: (tokenHash) =>
        run('end a session', async () => {
          await sql`delete from sessions where token_hash = ${tokenHash}`;
        }),
      touch: (tokenHash, at) =>
        run('note a session’s use', async () => {
          await sql`update sessions set last_seen_at = ${at} where token_hash = ${tokenHash}`;
        }),
      listForUser: (userId) =>
        run('list a user’s sessions', async () =>
          (await sql`select * from sessions where user_id = ${userId}`)
            .map(toSession)
            .sort(bySessionRecency),
        ),
      deleteForUser: (userId, except) =>
        run('end a user’s sessions', async () => {
          await sql`
            delete from sessions where user_id = ${userId}
            ${except === undefined ? sql`` : sql`and token_hash <> ${except}`}
          `;
        }),
      deleteEnded: (now, unusedSince) =>
        run('delete ended sessions', async () => {
          const rows = await sql`
            delete from sessions
            where expires_at <= ${now} or last_seen_at < ${unusedSince}
            returning token_hash
          `;
          return rows.length;
        }),
    },

    invites: {
      list: (workspaceId) =>
        scoped(workspaceId, 'list invites', async (sql) =>
          (await sql`select * from invites where workspace_id = ${workspaceId}`)
            .map(toInvite)
            .sort(byInvite),
        ),
      save: (workspaceId, invite) =>
        scoped(workspaceId, 'save an invite', async (sql) => {
          const row = inviteRow(workspaceId, invite);
          await sql`
            insert into invites ${sql(row)}
            on conflict (workspace_id, email) do update set
              id = excluded.id, role = excluded.role, token_hash = excluded.token_hash,
              invited_by = excluded.invited_by, invited_by_name = excluded.invited_by_name,
              created_at = excluded.created_at, expires_at = excluded.expires_at
          `;
        }),
      findByToken: (tokenHash) =>
        run('find an invite', async () => {
          const [row] = await sql`select * from find_invite(${tokenHash})`;
          return row
            ? { ...toInvite(row), workspaceId: String(row.workspace_id) }
            : null;
        }),
      remove: (workspaceId, id) =>
        scoped(workspaceId, 'withdraw an invite', async (sql) => {
          const rows = await sql`
            delete from invites where workspace_id = ${workspaceId} and id = ${id}
            returning id
          `;
          return rows.length > 0;
        }),
      accept: (tokenHash, user, now) =>
        run('accept an invite', async () => {
          const [row] = await sql`
            select accept_invite(
              ${tokenHash}, ${sql.json(userRow(user, now))}, ${now}
            ) as outcome
          `;
          return String(row?.outcome) as InviteOutcome;
        }),
    },

    mfa: {
      get: (userId) =>
        run('read two-factor sign-in', async () => {
          const [row] =
            await sql`select * from user_mfa where user_id = ${userId}`;
          return row ? toMfa(row) : null;
        }),
      begin: (userId, secret, at) =>
        run('start two-factor setup', async () => {
          const rows = await sql`
            insert into user_mfa (user_id, secret, created_at)
            values (${userId}, ${secret}, ${at})
            on conflict (user_id) do update set
              secret = excluded.secret, created_at = excluded.created_at,
              last_step = null, recovery_hashes = '{}'
            where user_mfa.enabled_at is null
            returning user_id
          `;
          return rows.length > 0;
        }),
      enable: (userId, recoveryHashes, at) =>
        run('turn on two-factor sign-in', async () => {
          const rows = await sql`
            update user_mfa set enabled_at = ${at}, recovery_hashes = ${recoveryHashes}
            where user_id = ${userId} and enabled_at is null
            returning user_id
          `;
          return rows.length > 0;
        }),
      useStep: (userId, step) =>
        run('use a two-factor code', async () => {
          const [row] =
            await sql`select use_mfa_step(${userId}, ${step}) as used`;
          return Boolean(row?.used);
        }),
      useRecoveryCode: (userId, hash) =>
        run('use a recovery code', async () => {
          const [row] =
            await sql`select use_recovery_code(${userId}, ${hash}) as used`;
          return Boolean(row?.used);
        }),
      remove: (userId) =>
        run('turn off two-factor sign-in', async () => {
          await sql`delete from user_mfa where user_id = ${userId}`;
        }),
    },

    notes: {
      list: (workspaceId, clientId) =>
        scoped(workspaceId, 'list notes', async (sql) => {
          const notes = (
            await sql`
              select * from meeting_notes
              where workspace_id = ${workspaceId} and ${
                clientId === null
                  ? sql`client_id is null`
                  : sql`client_id = ${clientId}`
              }
            `
          ).map(toNote);
          return (await withMeetingPoints(sql, workspaceId, notes)).sort(
            byNote,
          );
        }),
      get: (workspaceId, id) =>
        scoped(workspaceId, 'read notes', async (sql) => {
          const [row] = await sql`
            select * from meeting_notes
            where workspace_id = ${workspaceId} and id = ${id}
          `;
          if (!row) return null;
          const [note] = await withMeetingPoints(sql, workspaceId, [
            toNote(row),
          ]);
          return note!;
        }),
      add: (workspaceId, note, source) =>
        scoped(workspaceId, 'add notes', async (sql) => {
          await sql`
            select add_meeting_note(
              ${workspaceId},
              ${sql.json(noteRow(workspaceId, note))},
              ${source && sql.json(sourceRow(workspaceId, source))}
            )
          `;
        }),
      file: (workspaceId, id, clientId, source) =>
        scoped(workspaceId, 'file notes', async (sql) => {
          const [row] = await sql`
            select * from file_meeting_note(
              ${workspaceId}, ${id}, ${clientId},
              ${source && sql.json(sourceRow(workspaceId, source))}
            )
          `;
          return row ? toNote(row) : null;
        }),
      remove: (workspaceId, id) =>
        scoped(workspaceId, 'delete notes', async (sql) => {
          const rows = await sql`
            delete from meeting_notes
            where workspace_id = ${workspaceId} and id = ${id}
            returning id
          `;
          return rows.length > 0;
        }),
      inboxToken: (workspaceId, fresh, at) =>
        scoped(workspaceId, 'read the notes address', async (sql) => {
          await sql`
            insert into notes_inboxes (workspace_id, token, created_at)
            values (${workspaceId}, ${fresh}, ${at})
            on conflict (workspace_id) do nothing
          `;
          const [row] = await sql`
            select token from notes_inboxes where workspace_id = ${workspaceId}
          `;
          return String(row?.token);
        }),
      inboxWorkspace: (token) =>
        run('find a notes address', async () => {
          const [row] =
            await sql`select notes_inbox_workspace(${token}) as workspace_id`;
          return row?.workspace_id == null ? null : String(row.workspace_id);
        }),
    },

    rateLimits: {
      count: (bucket, since) =>
        run('count attempts', async () => {
          const [row] = await sql`
            select count(*)::int as count from rate_limit_hits
            where bucket = ${bucket} and at >= ${since}
          `;
          return Number(row?.count ?? 0);
        }),
      hit: (bucket, at) =>
        run('note an attempt', async () => {
          await sql`insert into rate_limit_hits (bucket, at) values (${bucket}, ${at})`;
        }),
      clear: (bucket) =>
        run('clear attempts', async () => {
          await sql`delete from rate_limit_hits where bucket = ${bucket}`;
        }),
      prune: (before) =>
        run('prune attempts', async () => {
          await sql`delete from rate_limit_hits where at < ${before}`;
        }),
    },

    signUps: {
      save: (signUp) =>
        run('save a sign-up', () =>
          sql.begin(async (tx) => {
            await tx`delete from sign_ups where email = ${signUp.email.toLowerCase()}`;
            await tx`insert into sign_ups ${tx(signUpRow(signUp))}`;
          }),
        ),
      find: (tokenHash) =>
        run('find a sign-up', async () => {
          const [row] =
            await sql`select * from sign_ups where token_hash = ${tokenHash}`;
          return row ? toSignUp(row) : null;
        }),
      findByEmail: (email) =>
        run('find a sign-up', async () => {
          const [row] =
            await sql`select * from sign_ups where email = ${email.toLowerCase()}`;
          return row ? toSignUp(row) : null;
        }),
      complete: (tokenHash, workspace, user, now) =>
        scoped(workspace.id, 'confirm a sign-up', async (sql) => {
          // complete_sign_up fills in the sign-up's own email and password.
          const [row] = await sql`
            select complete_sign_up(
              ${tokenHash},
              ${sql.json(workspaceRow(workspace))},
              ${sql.json(userRow({ ...user, email: '', passwordHash: '' }, now))},
              ${now}
            ) as outcome
          `;
          return String(row?.outcome) as SignUpOutcome;
        }),
      deleteExpired: (now) =>
        run('delete expired sign-ups', async () => {
          const rows = await sql`
            delete from sign_ups where expires_at <= ${now} returning token_hash
          `;
          return rows.length;
        }),
    },

    passwordResets: {
      create: (reset) =>
        run('save a password reset', () =>
          sql.begin(async (tx) => {
            await tx`
              delete from password_resets
              where user_id = ${reset.userId} and used_at is null
            `;
            await tx`
              insert into password_resets (token_hash, user_id, created_at, expires_at)
              values (${reset.tokenHash}, ${reset.userId}, ${reset.createdAt}, ${reset.expiresAt})
            `;
          }),
        ),
      consume: (tokenHash, now) =>
        run('use a password reset', async () => {
          // One statement, so only one of two racing requests gets the row.
          const [row] = await sql`
            update password_resets set used_at = ${now}
            where token_hash = ${tokenHash} and used_at is null and expires_at > ${now}
            returning user_id
          `;
          return row ? String(row.user_id) : null;
        }),
    },

    workspaces: {
      get: (workspaceId) =>
        scoped(workspaceId, 'read the workspace', async (sql) => {
          const [row] =
            await sql`select * from workspaces where id = ${workspaceId}`;
          return row ? toWorkspace(row) : null;
        }),
      create: (workspace) =>
        scoped(workspace.id, 'create a workspace', async (sql) => {
          await sql`insert into workspaces ${sql(workspaceRow(workspace))}`;
        }),
      suspension: (workspaceId) =>
        scoped(workspaceId, 'read the workspace’s suspension', async (sql) => {
          const [row] = await sql`
            select suspended_at, suspended_reason from workspaces
            where id = ${workspaceId} and suspended_at is not null
          `;
          return row
            ? {
                at: new Date(row.suspended_at).toISOString(),
                reason: String(row.suspended_reason),
              }
            : null;
        }),
      update: (workspaceId, { name, timeZone }) =>
        scoped(workspaceId, 'change the workspace', async (sql) => {
          await sql`
            update workspaces set
              name = coalesce(${name ?? null}, name),
              time_zone = coalesce(${timeZone ?? null}, time_zone)
            where id = ${workspaceId}
          `;
        }),
      profile: (workspaceId) =>
        scoped(workspaceId, 'read the company’s details', async (sql) => {
          const [row] =
            await sql`select profile from workspaces where id = ${workspaceId}`;
          return (row?.profile as Record<string, unknown> | null) ?? {};
        }),
      setProfile: (workspaceId, profile) =>
        scoped(workspaceId, 'save the company’s details', async (sql) => {
          await sql`
            update workspaces set profile = ${sql.json(profile as postgres.JSONValue)}
            where id = ${workspaceId}
          `;
        }),
    },

    clients: {
      list: (workspaceId) =>
        scoped(workspaceId, 'list clients', async (sql) =>
          (await sql`select * from clients where workspace_id = ${workspaceId}`)
            .map(toClient)
            .sort(byName),
        ),
      get: (workspaceId, clientId) =>
        scoped(workspaceId, 'read a client', async (sql) => {
          const [row] = await sql`
            select * from clients where workspace_id = ${workspaceId} and id = ${clientId}
          `;
          return row ? toClient(row) : null;
        }),
      overview: (workspaceId) =>
        scoped(workspaceId, 'build the clients overview', async (sql) => {
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
        scoped(workspaceId, 'list recent clients', async (sql) =>
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
        scoped(workspaceId, 'record a client view', async (sql) => {
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
      setContract: (workspaceId, clientId, contract) =>
        scoped(workspaceId, 'save a contract', async (sql) => {
          const [row] = await sql`
            update clients set ${sql(contractColumns(contract))}
            where workspace_id = ${workspaceId} and id = ${clientId}
            returning *
          `;
          return row ? toClient(row) : null;
        }),
      links: (workspaceId) =>
        scoped(workspaceId, 'list client links', async (sql) =>
          (
            await sql`
              select * from client_links where workspace_id = ${workspaceId}
              order by tool collate "C", external_id collate "C"
            `
          ).map(toClientLink),
        ),
      sync: (workspaceId, tool, { clients, links }, at) =>
        scoped(workspaceId, 'save synced clients', async (sql) => {
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
        scoped(workspaceId, 'list attention items', async (sql) =>
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
        scoped(workspaceId, 'list recommendations', async (sql) =>
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
        scoped(workspaceId, 'read a recommendation', async (sql) => {
          const [row] = await sql`
            select * from recommendations where workspace_id = ${workspaceId} and id = ${id}
          `;
          return row ? toRecommendation(row) : null;
        }),
      update: (workspaceId, id, changes) =>
        scoped(workspaceId, 'update a recommendation', async (sql) => {
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
      replaceDrafts: (workspaceId, clientId, runId, drafts) =>
        scoped(workspaceId, 'replace recommendation drafts', async (sql) => {
          await sql`
            select replace_recommendation_drafts(
              ${workspaceId}, ${clientId},
              ${sql.json(drafts.map((rec) => recommendationDraftRow(workspaceId, runId, rec)))}
            )
          `;
        }),
    },

    commitments: {
      list: (workspaceId, { clientId } = {}) =>
        scoped(workspaceId, 'list commitments', async (sql) =>
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
        scoped(workspaceId, 'list meetings', async (sql) => {
          const meetings = (
            await sql`
              select * from meetings
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
            `
          ).map(toMeeting);
          return (await withMeetingPoints(sql, workspaceId, meetings)).sort(
            byMeeting,
          );
        }),
    },

    meetingPoints: {
      states: (workspaceId, ids) =>
        scoped(workspaceId, 'read meeting points', async (sql) =>
          (await pointsFor(sql, workspaceId, ids)).map(toMeetingPoints),
        ),
      save: (workspaceId, clientId, record, excerpts) =>
        scoped(workspaceId, 'save meeting points', async (sql) => {
          await sql`
            select save_meeting_points(
              ${workspaceId}, ${clientId},
              ${sql.json(meetingPointsRow(workspaceId, record))},
              ${excerpts && sql.json(excerpts.map((e) => sourceRow(workspaceId, e)))}
            )
          `;
        }),
      prune: (workspaceId, now, before) =>
        scoped(workspaceId, 'prune meeting points', async (sql) => {
          await sql`select prune_meeting_points(${workspaceId}, ${now}, ${before})`;
        }),
    },

    devices: {
      list: (workspaceId, { clientId } = {}) =>
        scoped(workspaceId, 'list devices', async (sql) =>
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

    tickets: {
      list: (workspaceId, { clientId } = {}) =>
        scoped(workspaceId, 'list tickets', async (sql) =>
          (
            await sql`
              select * from tickets
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
            `
          )
            .map(toTicket)
            .sort(byTicket),
        ),
    },

    reports: {
      listSummaries: (workspaceId, { clientId, status } = {}) =>
        scoped(workspaceId, 'list reports', async (sql) => {
          const [rows, name] = await Promise.all([
            sql`
              select ${sql(REPORT_SUMMARY_COLUMNS)} from reports
              where workspace_id = ${workspaceId} ${clientFilter(clientId)}
              ${status === undefined ? sql`` : sql`and status = ${status}`}
            `,
            clientNames(sql, workspaceId),
          ]);
          return rows.map(toReportSummary).sort(byReportWeek(name));
        }),
      get: (workspaceId, id) =>
        scoped(workspaceId, 'read a report', async (sql) => {
          const [row] = await sql`
            select * from reports where workspace_id = ${workspaceId} and id = ${id}
          `;
          return row ? toReport(row) : null;
        }),
      save: (workspaceId, report) =>
        scoped(workspaceId, 'save a report', async (sql) => {
          const { glance, sections, sources, ...rest } = reportRow(
            workspaceId,
            report,
          );
          const row = {
            ...rest,
            glance: sql.json(glance),
            sections: sql.json(sections),
            sources: sql.json(sources as postgres.JSONValue),
          };
          await sql`
            insert into reports ${sql(row)}
            on conflict (id) do update set ${sql(row)}
            where reports.workspace_id = ${workspaceId}
          `;
        }),
      setStatus: (workspaceId, ids, status, at) =>
        scoped(workspaceId, 'update report status', async (sql) => {
          if (ids.length === 0) return [];
          const rows = await sql`
            update reports
            set status = ${status}, approved_at = ${status === 'approved' ? at : null}
            where workspace_id = ${workspaceId} and id in ${sql(ids)}
              and sent_at is null
            returning ${sql(REPORT_SUMMARY_COLUMNS)}
          `;
          return inIdOrder(ids, rows.map(toReportSummary));
        }),
      markSent: (workspaceId, id, at) =>
        scoped(workspaceId, 'mark a report sent', async (sql) => {
          const rows = await sql`
            update reports set sent_at = ${at}
            where workspace_id = ${workspaceId} and id = ${id}
              and status = 'approved' and sent_at is null
            returning id
          `;
          return rows.length > 0;
        }),
      clearSent: (workspaceId, id) =>
        scoped(workspaceId, 'mark a report unsent', async (sql) => {
          await sql`
            update reports set sent_at = null
            where workspace_id = ${workspaceId} and id = ${id}
          `;
        }),
    },

    reportSettings: {
      get: (workspaceId) =>
        scoped(workspaceId, 'read report settings', async (sql) => {
          const [row] = await sql`
            select * from report_settings where workspace_id = ${workspaceId}
          `;
          return row ? toReportSettings(row) : null;
        }),
      save: (workspaceId, settings) =>
        scoped(workspaceId, 'save report settings', async (sql) => {
          const row = reportSettingsRow(workspaceId, settings);
          await sql`
            insert into report_settings ${sql(row)}
            on conflict (workspace_id) do update set ${sql(row)}
          `;
        }),
      listScheduled: () =>
        run('list report schedules', async () =>
          (
            await sql`
              select workspace_id from scheduled_report_workspaces() as workspace_id
              order by workspace_id collate "C"
            `
          ).map((row) => String(row.workspace_id)),
        ),
      markDrafted: (workspaceId, weekStart) =>
        scoped(workspaceId, 'note the scheduled draft', async (sql) => {
          const rows = await sql`
            update report_settings set drafted_week = ${weekStart}
            where workspace_id = ${workspaceId}
              and drafted_week is distinct from ${weekStart}
            returning workspace_id
          `;
          return rows.length > 0;
        }),
    },

    recipients: {
      list: (workspaceId, clientId) =>
        scoped(workspaceId, 'list recipients', async (sql) =>
          (
            await sql`
              select * from client_recipients
              where workspace_id = ${workspaceId} and client_id = ${clientId}
              order by position
            `
          ).map(toRecipient),
        ),
      replace: (workspaceId, clientId, recipients) =>
        scoped(workspaceId, 'save recipients', async (sql) => {
          const [client] = await sql`
            select id from clients
            where workspace_id = ${workspaceId} and id = ${clientId}
          `;
          if (!client) return;
          await sql`
            delete from client_recipients
            where workspace_id = ${workspaceId} and client_id = ${clientId}
          `;
          if (recipients.length > 0) {
            await sql`
              insert into client_recipients
              ${sql(recipientRows(workspaceId, clientId, recipients))}
            `;
          }
        }),
    },

    contractDocuments: {
      list: (workspaceId, clientId) =>
        scoped(workspaceId, 'list contract documents', async (sql) =>
          (
            await sql`
              select ${sql(CONTRACT_DOCUMENT_COLUMNS)} from contract_documents
              where workspace_id = ${workspaceId} and client_id = ${clientId}
            `
          )
            .map(toContractDocument)
            .sort(byDocument),
        ),
      get: (workspaceId, id) =>
        scoped(workspaceId, 'read a contract document', async (sql) => {
          const [row] = await sql`
            select * from contract_documents
            where workspace_id = ${workspaceId} and id = ${id}
          `;
          return row
            ? {
                document: toContractDocument(row),
                content: new Uint8Array(row.content as Buffer),
              }
            : null;
        }),
      add: (workspaceId, document, content) =>
        scoped(workspaceId, 'save a contract document', async (sql) => {
          await sql`
            insert into contract_documents ${sql({
              ...contractDocumentRow(workspaceId, document),
              content: Buffer.from(content),
            })}
          `;
        }),
      remove: (workspaceId, id) =>
        scoped(workspaceId, 'delete a contract document', async (sql) => {
          const rows = await sql`
            delete from contract_documents
            where workspace_id = ${workspaceId} and id = ${id}
            returning id
          `;
          return rows.length > 0;
        }),
    },

    deliveries: {
      list: (workspaceId, reportId) =>
        scoped(workspaceId, 'list report deliveries', async (sql) =>
          (
            await sql`
              select * from report_deliveries
              where workspace_id = ${workspaceId} and report_id = ${reportId}
            `
          )
            .map(toDelivery)
            .sort(byDelivery),
        ),
      add: (workspaceId, delivery) =>
        scoped(workspaceId, 'record a report delivery', async (sql) => {
          await sql`
            insert into report_deliveries ${sql(deliveryRow(workspaceId, delivery))}
          `;
        }),
    },

    reportQuestions: {
      list: (workspaceId, { clientId } = {}) =>
        scoped(workspaceId, 'list report questions', async (sql) =>
          (
            await sql`
              select * from report_questions
              where workspace_id = ${workspaceId}
              ${clientId === undefined ? sql`` : sql`and (client_id is null or client_id = ${clientId})`}
            `
          )
            .map(toReportQuestion)
            .sort(byQuestion),
        ),
      create: (workspaceId, question) =>
        scoped(workspaceId, 'save a report question', async (sql) => {
          await sql`
            insert into report_questions ${sql(reportQuestionRow(workspaceId, question))}
          `;
        }),
      update: (workspaceId, id, changes) =>
        scoped(workspaceId, 'update a report question', async (sql) => {
          const row = reportQuestionChangesRow(changes);
          const [updated] =
            Object.keys(row).length === 0
              ? await sql`
                  select * from report_questions
                  where workspace_id = ${workspaceId} and id = ${id}
                `
              : await sql`
                  update report_questions set ${sql(row)}
                  where workspace_id = ${workspaceId} and id = ${id}
                  returning *
                `;
          return updated ? toReportQuestion(updated) : null;
        }),
      remove: (workspaceId, id) =>
        scoped(workspaceId, 'remove a report question', async (sql) => {
          const rows = await sql`
            delete from report_questions
            where workspace_id = ${workspaceId} and id = ${id}
            returning id
          `;
          return rows.length > 0;
        }),
    },

    sources: {
      getMany: (workspaceId, ids) =>
        scoped(workspaceId, 'read sources', async (sql) => {
          if (ids.length === 0) return [];
          const rows = await sql`
            select * from sources where workspace_id = ${workspaceId} and id in ${sql(ids)}
          `;
          return inIdOrder(ids, rows.map(toSource));
        }),
      listForClient: (workspaceId, clientId) =>
        scoped(workspaceId, "list a client's sources", async (sql) =>
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
        scoped(workspaceId, `replace ${tool} records`, async (sql) => {
          await sql`
            select replace_tool_records(
              ${workspaceId}, ${tool},
              ${sql.json(toolRecordsPayload(workspaceId, tool, records))}
            )
          `;
        }),
      upsert: (workspaceId, tool, records) =>
        scoped(workspaceId, `save ${tool} records`, async (sql) => {
          await sql`
            select upsert_tool_records(
              ${workspaceId}, ${tool},
              ${sql.json(toolRecordsPayload(workspaceId, tool, records))}
            )
          `;
        }),
      removeTool: (workspaceId, tool) =>
        scoped(workspaceId, `remove ${tool} records`, async (sql) => {
          await sql`select remove_tool(${workspaceId}, ${tool})`;
        }),
    },

    connectors: {
      list: (workspaceId) =>
        scoped(workspaceId, 'list connectors', async (sql) =>
          (
            await sql`select * from connectors where workspace_id = ${workspaceId}`
          )
            .map(toConnector)
            .sort(byTool),
        ),
      get: (workspaceId, tool) =>
        scoped(workspaceId, 'read a connector', async (sql) => {
          const [row] = await sql`
            select * from connectors where workspace_id = ${workspaceId} and tool = ${tool}
          `;
          return row ? toConnectorRecord(row) : null;
        }),
      save: (workspaceId, record) =>
        scoped(workspaceId, 'save a connector', async (sql) => {
          const row = withJson(connectorRow(workspaceId, record));
          await sql`
            insert into connectors ${sql(row)}
            on conflict (workspace_id, tool) do update set ${sql(row)}
          `;
        }),
      update: (workspaceId, tool, changes) =>
        scoped(workspaceId, 'update a connector', async (sql) => {
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
        scoped(workspaceId, 'remove a connector', async (sql) => {
          await sql`delete from connectors where workspace_id = ${workspaceId} and tool = ${tool}`;
        }),
      listAll: () =>
        run('list every connector', async () =>
          (
            await sql`
              select workspace_id, tool from connected_tools()
              order by workspace_id collate "C", tool collate "C"
            `
          ).map((row) => ({
            workspaceId: String(row.workspace_id),
            tool: String(row.tool) as Tool,
          })),
        ),
    },

    audit: {
      list: (
        workspaceId,
        { kind, tool, clientId, before, after, limit = AUDIT_PAGE_SIZE } = {},
      ) =>
        scoped(workspaceId, 'read the audit log', async (sql) =>
          (
            await sql`
              select * from audit_entries
              where workspace_id = ${workspaceId}
              ${kind === undefined ? sql`` : sql`and kind = ${kind}`}
              ${tool === undefined ? sql`` : sql`and tool = ${tool}`}
              ${clientId === undefined ? sql`` : sql`and (client_id = ${clientId} or client_id is null)`}
              ${before === undefined ? sql`` : sql`and (at < ${before.at} or (at = ${before.at} and id collate "C" > ${before.id}))`}
              ${after === undefined ? sql`` : sql`and (at > ${after.at} or (at = ${after.at} and id collate "C" < ${after.id}))`}
              order by ${after === undefined ? sql`at desc, id collate "C"` : sql`at, id collate "C" desc`}
              limit ${limit}
            `
          )
            .map(toAuditEntry)
            .sort(byAuditRecency),
        ),
      counts: (workspaceId, { clientId } = {}) =>
        scoped(workspaceId, 'count the audit log', async (sql) => {
          const rows = await sql`
            select kind, tool, count(*)::int as count from audit_entries
            where workspace_id = ${workspaceId}
            ${clientId === undefined ? sql`` : sql`and (client_id = ${clientId} or client_id is null)`}
            group by kind, tool
          `;
          const counted = rows.map((row) => ({
            kind: String(row.kind) as AuditKind,
            tool: row.tool === null ? null : (String(row.tool) as Tool),
            count: Number(row.count),
          }));
          return AUDIT_COUNT_GROUPS.map((group) => ({
            ...group,
            count: counted
              .filter(inAuditGroup(group))
              .reduce((sum, row) => sum + row.count, 0),
          }));
        }),
      append: (workspaceId, entries) =>
        scoped(workspaceId, 'write to the audit log', async (sql) => {
          if (entries.length === 0) return;
          await sql`insert into audit_entries ${sql(entries.map((e) => auditRow(workspaceId, e)))}`;
        }),
      prune: (workspaceId, before, kinds) =>
        scoped(workspaceId, 'prune the audit log', async (sql) => {
          if (kinds.length === 0) return;
          await sql`
            delete from audit_entries
            where workspace_id = ${workspaceId} and at < ${before} and kind in ${sql(kinds)}
          `;
        }),
    },

    intelligence: {
      model: (workspaceId) =>
        scoped(workspaceId, 'read the intelligence model', async (sql) => {
          const [row] = await sql`
            select intelligence_model from workspaces where id = ${workspaceId}
          `;
          return row?.intelligence_model == null
            ? null
            : String(row.intelligence_model);
        }),
      setModel: (workspaceId, model) =>
        scoped(workspaceId, 'set the intelligence model', async (sql) => {
          await sql`
            update workspaces set intelligence_model = ${model} where id = ${workspaceId}
          `;
        }),
      preferences: (workspaceId) =>
        scoped(workspaceId, 'read intelligence preferences', async (sql) => {
          const [row] = await sql`
            select intelligence_preferences from workspaces where id = ${workspaceId}
          `;
          return (row?.intelligence_preferences ?? {}) as Record<
            string,
            unknown
          >;
        }),
      setPreferences: (workspaceId, preferences) =>
        scoped(workspaceId, 'save intelligence preferences', async (sql) => {
          await sql`
            update workspaces
            set intelligence_preferences = ${sql.json(preferences as postgres.JSONValue)}
            where id = ${workspaceId}
          `;
        }),
      lastRun: (workspaceId, kind, clientId) =>
        scoped(workspaceId, 'read the last intelligence run', async (sql) => {
          const [row] = await sql`
            select * from intelligence_runs
            where workspace_id = ${workspaceId} and kind = ${kind}
              and client_id is not distinct from ${clientId}
            order by started_at desc, id collate "C"
            limit 1
          `;
          return row ? toIntelligenceRun(row) : null;
        }),
      saveRun: (workspaceId, saved) =>
        scoped(workspaceId, 'save an intelligence run', async (sql) => {
          const { usage, ...rest } = intelligenceRunRow(workspaceId, saved);
          const row = { ...rest, usage: sql.json(usage) };
          await sql`
            insert into intelligence_runs ${sql(row)}
            on conflict (id) do update set ${sql(row)}
          `;
        }),
      runs: (workspaceId, since) =>
        scoped(workspaceId, 'list intelligence runs', async (sql) =>
          (
            await sql`
              select * from intelligence_runs
              where workspace_id = ${workspaceId} and started_at >= ${since}
            `
          )
            .map(toIntelligenceRun)
            .sort(byRunRecency),
        ),
    },

    ask: {
      list: (workspaceId, { askedBy, limit }) =>
        scoped(workspaceId, 'list questions asked', async (sql) =>
          (
            await sql`
              select ${sql(ASK_SUMMARY_COLUMNS)} from ask_answers
              where workspace_id = ${workspaceId}
                ${askedBy === undefined ? sql`` : sql`and asked_by = ${askedBy}`}
              order by asked_at desc, id collate "C"
              limit ${limit}
            `
          )
            .map(toAskSummary)
            .sort(byAsked),
        ),
      get: (workspaceId, id) =>
        scoped(workspaceId, 'read an answer', async (sql) => {
          const [row] = await sql`
            select * from ask_answers where workspace_id = ${workspaceId} and id = ${id}
          `;
          return row ? toAskAnswer(row) : null;
        }),
      create: (workspaceId, answer) =>
        scoped(workspaceId, 'save a question', async (sql) => {
          await sql`insert into ask_answers ${sql(asJson(askRow(workspaceId, answer)))}`;
        }),
      update: (workspaceId, id, changes) =>
        scoped(workspaceId, 'save an answer', async (sql) => {
          const row = asJson(askChangesRow(changes));
          if (Object.keys(row).length === 0) return false;
          const rows = await sql`
            update ask_answers set ${sql(row)}
            where workspace_id = ${workspaceId} and id = ${id}
              and status = 'answering'
            returning id
          `;
          return rows.length > 0;
        }),
      remove: (workspaceId, id) =>
        scoped(workspaceId, 'delete an answer', async (sql) => {
          const rows = await sql`
            delete from ask_answers where workspace_id = ${workspaceId} and id = ${id}
            returning id
          `;
          return rows.length > 0;
        }),
    },

    patterns: {
      list: (workspaceId) =>
        scoped(workspaceId, 'list patterns', async (sql) =>
          (
            await sql`
              select * from patterns where workspace_id = ${workspaceId}
              order by position
            `
          ).map(toPattern),
        ),
      replace: (workspaceId, patterns) =>
        scoped(workspaceId, 'save patterns', async (sql) => {
          await sql`
            select replace_patterns(
              ${workspaceId},
              ${sql.json(patternRows(workspaceId, patterns) as postgres.JSONValue)}
            )
          `;
        }),
    },

    events: {
      append: (workspaceId, event) =>
        scoped(workspaceId, 'record an event', async (sql) => {
          const row = {
            ...eventRow(workspaceId, event),
            payload: sql.json(event.payload as postgres.JSONValue),
          };
          const rows = await sql`
            insert into events ${sql(row)}
            on conflict (workspace_id, dedupe_key) do nothing
            returning id
          `;
          return rows.length > 0;
        }),
      claim: (now, until, limit) =>
        run('claim events', async () =>
          (
            await sql`
              select * from claim_events(
                ${now}::timestamptz, ${until}::timestamptz, ${limit}::integer
              )
            `
          )
            .map(toEventRecord)
            .sort(byEvent),
        ),
      markDispatched: (workspaceId, id, at) =>
        scoped(workspaceId, 'mark an event dispatched', async (sql) => {
          await sql`
            update events set dispatched_at = ${at}, locked_until = null
            where workspace_id = ${workspaceId} and id = ${id}
          `;
        }),
      retry: (workspaceId, id, nextAttemptAt, error) =>
        scoped(workspaceId, 'put an event back', async (sql) => {
          await sql`
            update events
            set next_attempt_at = ${nextAttemptAt}, locked_until = null,
              last_error = ${error}
            where workspace_id = ${workspaceId} and id = ${id}
          `;
        }),
      markFailed: (workspaceId, id, at, error) =>
        scoped(workspaceId, 'give up on an event', async (sql) => {
          await sql`
            update events
            set failed_at = ${at}, locked_until = null, last_error = ${error}
            where workspace_id = ${workspaceId} and id = ${id}
          `;
        }),
      prune: (workspaceId, before) =>
        scoped(workspaceId, 'prune events', async (sql) => {
          await sql`
            delete from events
            where workspace_id = ${workspaceId} and occurred_at < ${before}
              and (dispatched_at is not null or failed_at is not null)
          `;
        }),
    },

    notifications: {
      add: (workspaceId, notifications) =>
        scoped(workspaceId, 'add notifications', async (sql) => {
          if (notifications.length === 0) return;
          await sql`
            insert into notifications
            ${sql(notifications.map((n) => notificationRow(workspaceId, n)))}
            on conflict do nothing
          `;
        }),
      forEvent: (workspaceId, eventId) =>
        scoped(workspaceId, 'read an event’s notifications', async (sql) =>
          (
            await sql`
              select * from notifications
              where workspace_id = ${workspaceId} and event_id = ${eventId}
            `
          )
            .map(toNotification)
            .sort(byNotification),
        ),
      list: (workspaceId, userId, { before, unread, limit = 30 } = {}) =>
        scoped(workspaceId, 'list notifications', async (sql) =>
          (
            await sql`
              select * from notifications
              where workspace_id = ${workspaceId} and user_id = ${userId}
                and in_app
              ${unread ? sql`and read_at is null` : sql``}
              ${before === undefined ? sql`` : sql`and (created_at < ${before.at} or (created_at = ${before.at} and id collate "C" > ${before.id}))`}
              order by created_at desc, id collate "C"
              limit ${limit}
            `
          )
            .map(toNotification)
            .sort(byNotification),
        ),
      countUnread: (workspaceId, userId) =>
        scoped(workspaceId, 'count unread notifications', async (sql) => {
          const [row] = await sql`
            select count(*)::int as n from notifications
            where workspace_id = ${workspaceId} and user_id = ${userId}
              and in_app and read_at is null
          `;
          return Number(row?.n ?? 0);
        }),
      markRead: (workspaceId, userId, ids, at) =>
        scoped(workspaceId, 'mark notifications read', async (sql) => {
          if (ids !== 'all' && ids.length === 0) return 0;
          const rows = await sql`
            update notifications set read_at = ${at}
            where workspace_id = ${workspaceId} and user_id = ${userId}
              and in_app and read_at is null
            ${ids === 'all' ? sql`` : sql`and id in ${sql(ids)}`}
            returning id
          `;
          return rows.length;
        }),
      claimEmail: (workspaceId, id, at, staleBefore) =>
        scoped(workspaceId, 'claim a notification email', async (sql) => {
          const rows = await sql`
            update notifications set email_claimed_at = ${at}
            where workspace_id = ${workspaceId} and id = ${id}
              and email and email_sent_at is null
              and (email_claimed_at is null or email_claimed_at < ${staleBefore})
            returning id
          `;
          return rows.length > 0;
        }),
      markEmailed: (workspaceId, id, at) =>
        scoped(workspaceId, 'mark a notification emailed', async (sql) => {
          await sql`
            update notifications set email_sent_at = ${at}
            where workspace_id = ${workspaceId} and id = ${id}
          `;
        }),
      releaseEmail: (workspaceId, id) =>
        scoped(workspaceId, 'release a notification email', async (sql) => {
          await sql`
            update notifications set email_claimed_at = null
            where workspace_id = ${workspaceId} and id = ${id}
              and email_sent_at is null
          `;
        }),
      prune: (workspaceId, before) =>
        scoped(workspaceId, 'prune notifications', async (sql) => {
          await sql`
            delete from notifications
            where workspace_id = ${workspaceId} and created_at < ${before}
          `;
        }),
      preferences: (workspaceId) =>
        scoped(workspaceId, 'read notification preferences', async (sql) => {
          const rows = await sql`
            select user_id, notification_preferences from workspace_members
            where workspace_id = ${workspaceId}
              and notification_preferences is not null
          `;
          return Object.fromEntries(
            rows.map((row) => [
              String(row.user_id),
              row.notification_preferences as unknown,
            ]),
          );
        }),
      setPreferences: (workspaceId, userId, preferences) =>
        scoped(workspaceId, 'save notification preferences', async (sql) => {
          const rows = await sql`
            update workspace_members
            set notification_preferences = ${sql.json(preferences as postgres.JSONValue)}
            where workspace_id = ${workspaceId} and user_id = ${userId}
            returning user_id
          `;
          return rows.length > 0;
        }),
    },

    staff: {
      list: () =>
        run('list staff', async () =>
          (await sql`select * from staff_users`).map(toStaff).sort(byMember),
        ),
      get: (id) =>
        run('read a member of staff', async () => {
          const [row] = await sql`select * from staff_users where id = ${id}`;
          return row ? toStaffRecord(row) : null;
        }),
      findByEmail: (email) =>
        run('find a member of staff', async () => {
          const [row] =
            await sql`select * from staff_users where email = ${email.toLowerCase()}`;
          return row ? toStaffRecord(row) : null;
        }),
      setRole: (id, role) =>
        run('change a staff role', async () => {
          const rows = await sql`
            update staff_users set role = ${role} where id = ${id} returning id
          `;
          return rows.length > 0;
        }),
      disable: (id, at) =>
        run('disable a member of staff', async () =>
          sql.begin(async (tx) => {
            const rows = await tx`
              update staff_users set disabled_at = ${at}
              where id = ${id} and disabled_at is null
              returning id
            `;
            await tx`delete from staff_sessions where staff_id = ${id}`;
            return rows.length > 0;
          }),
        ),
      setPassword: (id, passwordHash) =>
        run('change a staff password', async () => {
          await sql`update staff_users set password_hash = ${passwordHash} where id = ${id}`;
        }),
      useStep: (id, step) =>
        run('use a staff two-factor code', async () => {
          const [row] =
            await sql`select use_staff_step(${id}, ${step}) as used`;
          return Boolean(row?.used);
        }),
      useRecoveryCode: (id, hash) =>
        run('use a staff recovery code', async () => {
          const [row] =
            await sql`select use_staff_recovery_code(${id}, ${hash}) as used`;
          return Boolean(row?.used);
        }),
      invites: () =>
        run('list staff invites', async () =>
          (await sql`select * from staff_invites`)
            .map(toStaffInvite)
            .sort(byInvite),
        ),
      saveInvite: (invite) =>
        run('save a staff invite', async () => {
          await sql`
            insert into staff_invites ${sql(staffInviteRow(invite))}
            on conflict (email) do update set
              id = excluded.id, role = excluded.role, token_hash = excluded.token_hash,
              invited_by = excluded.invited_by, invited_by_name = excluded.invited_by_name,
              created_at = excluded.created_at, expires_at = excluded.expires_at
          `;
        }),
      findInvite: (tokenHash) =>
        run('find a staff invite', async () => {
          const [row] =
            await sql`select * from staff_invites where token_hash = ${tokenHash}`;
          return row ? toStaffInvite(row) : null;
        }),
      removeInvite: (id) =>
        run('withdraw a staff invite', async () => {
          const rows =
            await sql`delete from staff_invites where id = ${id} returning id`;
          return rows.length > 0;
        }),
      acceptInvite: (tokenHash, staff, now) =>
        run('accept a staff invite', async () => {
          const [row] = await sql`
            select accept_staff_invite(
              ${tokenHash}, ${sql.json(staffRow(staff))}, ${now}
            ) as outcome
          `;
          return String(row?.outcome) as InviteOutcome;
        }),
    },

    staffSessions: {
      create: (session) =>
        run('create a staff session', async () => {
          await sql`insert into staff_sessions ${sql(staffSessionRow(session))}`;
        }),
      find: (tokenHash) =>
        run('read a staff session', async () => {
          const [row] =
            await sql`select * from staff_sessions where token_hash = ${tokenHash}`;
          return row ? toStaffSession(row) : null;
        }),
      delete: (tokenHash) =>
        run('end a staff session', async () => {
          await sql`delete from staff_sessions where token_hash = ${tokenHash}`;
        }),
      touch: (tokenHash, at) =>
        run('note a staff session’s use', async () => {
          await sql`update staff_sessions set last_seen_at = ${at} where token_hash = ${tokenHash}`;
        }),
      deleteEnded: (now, unusedSince) =>
        run('delete ended staff sessions', async () => {
          const rows = await sql`
            delete from staff_sessions
            where expires_at <= ${now} or last_seen_at < ${unusedSince}
            returning token_hash
          `;
          return rows.length;
        }),
    },

    staffAudit: {
      append: (entry) =>
        run('write to the staff log', async () => {
          await sql`insert into staff_audit ${sql(staffAuditRow(entry))}`;
        }),
      list: ({ workspaceId, before, after, limit = AUDIT_PAGE_SIZE } = {}) =>
        run('read the staff log', async () =>
          (
            await sql`
              select * from staff_audit
              where true
              ${workspaceId === undefined ? sql`` : sql`and workspace_id = ${workspaceId}`}
              ${before === undefined ? sql`` : sql`and (at < ${before.at} or (at = ${before.at} and id collate "C" > ${before.id}))`}
              ${after === undefined ? sql`` : sql`and (at > ${after.at} or (at = ${after.at} and id collate "C" < ${after.id}))`}
              order by ${after === undefined ? sql`at desc, id collate "C"` : sql`at, id collate "C" desc`}
              limit ${limit}
            `
          )
            .map(toStaffAuditEntry)
            .sort(byAuditRecency),
        ),
    },

    platform: {
      workspaces: ({ search, status, limit, offset }) =>
        run('list workspaces', async () => {
          const rows = await sql`
            select * from platform_workspaces(
              ${search ?? null}, ${status ?? null}, null, ${limit}, ${offset}
            )
          `;
          return {
            data: rows.map(toWorkspaceSummary).sort(byNewestWorkspace),
            total: rows.length > 0 ? Number(rows[0]!.total) : 0,
          };
        }),
      workspace: (workspaceId) =>
        run('read a workspace', async () => {
          const [row] = await sql`
            select * from platform_workspaces(null, null, ${workspaceId}, 1, 0)
          `;
          return row ? toWorkspaceSummary(row) : null;
        }),
      people: ({ search, workspaceId, userId, limit }) =>
        run('list people', async () =>
          (
            await sql`
              select * from platform_people(
                ${search ?? null}, ${workspaceId ?? null}, ${userId ?? null}, ${limit}
              )
            `
          )
            .map(toPlatformPerson)
            .sort(byMember),
        ),
      suspend: (workspaceId, reason, at) =>
        scoped(workspaceId, 'suspend a workspace', async (sql) => {
          const rows = await sql`
            update workspaces set suspended_at = ${at}, suspended_reason = ${reason}
            where id = ${workspaceId}
            returning id
          `;
          await sql`delete from sessions where workspace_id = ${workspaceId}`;
          return rows.length > 0;
        }),
      restore: (workspaceId) =>
        scoped(workspaceId, 'restore a workspace', async (sql) => {
          const rows = await sql`
            update workspaces set suspended_at = null, suspended_reason = null
            where id = ${workspaceId}
            returning id
          `;
          return rows.length > 0;
        }),
      remove: (workspaceId) =>
        scoped(workspaceId, 'delete a workspace', async (sql) => {
          const [row] =
            await sql`select delete_workspace(${workspaceId}) as deleted`;
          return Boolean(row?.deleted);
        }),
    },

    supportGrants: {
      create: (grant) =>
        run('open a support view', async () => {
          await sql`insert into support_grants ${sql(supportGrantRow(grant))}`;
        }),
      get: (id) =>
        run('read a support view', async () => {
          const [row] =
            await sql`select * from support_grants where id = ${id}`;
          return row ? toSupportGrantRecord(row) : null;
        }),
      findByHandoff: (handoffHash) =>
        run('find a support link', async () => {
          const [row] = await sql`
            select * from support_grants where handoff_hash = ${handoffHash}
          `;
          return row ? toSupportGrantRecord(row) : null;
        }),
      findBySession: (sessionHash) =>
        run('find a support view', async () => {
          const [row] = await sql`
            select * from support_grants where session_hash = ${sessionHash}
          `;
          return row ? toSupportGrantRecord(row) : null;
        }),
      redeem: (id, handoffHash, sessionHash, actingUserId, now) =>
        run('open a support link', async () => {
          const rows = await sql`
            update support_grants set
              handoff_hash = null, session_hash = ${sessionHash},
              acting_user_id = ${actingUserId}, redeemed_at = ${now}
            where id = ${id} and handoff_hash = ${handoffHash}
              and handoff_expires_at > ${now} and expires_at > ${now}
              and ended_at is null
            returning id
          `;
          return rows.length > 0;
        }),
      setActingUser: (id, userId) =>
        run('change who a support view acts as', async () => {
          await sql`update support_grants set acting_user_id = ${userId} where id = ${id}`;
        }),
      list: ({ workspaceId, liveAt, limit }) =>
        run('list support views', async () =>
          (
            await sql`
              select * from support_grants
              where true
              ${workspaceId === undefined ? sql`` : sql`and workspace_id = ${workspaceId}`}
              ${liveAt === undefined ? sql`` : sql`and ended_at is null and expires_at > ${liveAt}`}
              order by created_at desc, id collate "C"
              limit ${limit}
            `
          )
            .map(toSupportGrant)
            .sort(byInvite),
        ),
      end: (id, at, by) =>
        run('end a support view', async () => {
          const rows = await sql`
            update support_grants set ended_at = ${at}, ended_by = ${by}
            where id = ${id} and ended_at is null
            returning id
          `;
          return rows.length > 0;
        }),
      endExpired: (now) =>
        run('end support views that ran out', async () =>
          (
            await sql`
              update support_grants
              set ended_at = expires_at, ended_by = 'Its time ran out'
              where ended_at is null and expires_at <= ${now}
              returning *
            `
          ).map(toSupportGrantRecord),
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
