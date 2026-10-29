import { demo } from '@dossierhq/fixtures';
import postgres from 'postgres';
import { loadDemoWorkspace } from '../../testing/load-demo.js';

const { DATABASE_URL, DATABASE_APP_URL } = process.env;
const ws = demo.workspace.id;

/** Tables whose every row belongs to one workspace. */
const TENANT_TABLES = [
  'attention_items',
  'audit_entries',
  'client_links',
  'client_views',
  'client_recipients',
  'clients',
  'commitments',
  'connectors',
  'contract_documents',
  'devices',
  'intelligence_runs',
  'invites',
  'meeting_notes',
  'meeting_points',
  'meetings',
  'notes_inboxes',
  'recommendations',
  'report_deliveries',
  'report_questions',
  'report_settings',
  'reports',
  'sources',
  'tickets',
];

describe.skipIf(!DATABASE_URL || !DATABASE_APP_URL)(
  'row level security for dossier_app',
  () => {
    let app: postgres.Sql;
    let owner: postgres.Sql;
    let cleanUp: () => Promise<void>;

    /** Runs `query` as dossier_app, with app.workspace_id set unless null. */
    const as = <T>(
      workspaceId: string | null,
      query: (sql: postgres.TransactionSql) => Promise<T>,
    ) =>
      app.begin(async (tx) => {
        if (workspaceId !== null) {
          await tx`select set_config('app.workspace_id', ${workspaceId}, true)`;
        }
        return query(tx);
      }) as Promise<T>;
    const count = (workspaceId: string | null, table: string) =>
      as(workspaceId, async (sql) => {
        const [row] = await sql`select count(*)::int as n from ${sql(table)}`;
        return Number(row?.n);
      });

    beforeAll(async () => {
      cleanUp = await loadDemoWorkspace(DATABASE_URL!);
      owner = postgres(DATABASE_URL!, { max: 1, onnotice: () => {} });
      app = postgres(DATABASE_APP_URL!, { max: 1, onnotice: () => {} });
    });

    afterAll(async () => {
      await app?.end();
      await owner?.end();
      await cleanUp?.();
    });

    it('shows a query with no workspace filter only its own workspace', async () => {
      await expect(count(ws, 'clients')).resolves.toBe(demo.clients.length);
      const [row] = await as(
        ws,
        (sql) =>
          sql`select count(distinct workspace_id)::int as n from clients`,
      );
      expect(Number(row?.n)).toBe(1);
    });

    it('hides every tenant table from another workspace, and from none', async () => {
      for (const table of TENANT_TABLES) {
        await expect(count('elsewhere', table), table).resolves.toBe(0);
        await expect(count(null, table), table).resolves.toBe(0);
      }
      await expect(count('elsewhere', 'workspaces')).resolves.toBe(0);
      // The demo does have rows in them.
      await expect(count(ws, 'sources')).resolves.toBe(demo.sources.length);
    });

    it('refuses writes into another workspace', async () => {
      await expect(
        as(
          'elsewhere',
          (sql) =>
            sql`insert into clients (id, workspace_id, name) values ('rls-test', ${ws}, 'x')`,
        ),
      ).rejects.toThrow(/row-level security/);
      const updated = await as(
        'elsewhere',
        (sql) =>
          sql`update clients set name = 'taken' where workspace_id = ${ws}`,
      );
      expect(updated.count).toBe(0);
      const deleted = await as(
        'elsewhere',
        (sql) => sql`delete from sources where workspace_id = ${ws}`,
      );
      expect(deleted.count).toBe(0);
    });

    it('lets the cross-workspace reads through their narrow functions only', async () => {
      const tools = await as(
        null,
        (sql) =>
          sql`select * from connected_tools() where workspace_id = ${ws}`,
      );
      expect(tools.map((t) => t.tool).sort()).toEqual(
        demo.connectors.map((c) => c.tool).sort(),
      );
      // Signing in needs users before any workspace is known.
      await expect(count(null, 'users')).resolves.toBeGreaterThan(0);
    });

    it('covers every table: row security on, and a policy for dossier_app', async () => {
      const tables = await owner`
        select c.relname as table, c.relrowsecurity as secured,
          exists (
            select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname
              and 'dossier_app' = any (p.roles)
          ) as has_policy
        from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      `;
      expect(
        tables.filter((t) => !t.secured || !t.has_policy).map((t) => t.table),
      ).toEqual([]);
    });
  },
);
