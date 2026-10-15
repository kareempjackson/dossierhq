# DossierHQ

pnpm + Turborepo monorepo for Dossier: a **Next.js 16** frontend (Tailwind CSS v4), a **NestJS 12** API, and a database layer that runs on **Supabase** today and can switch to another database with one environment variable.

```
apps/
  web/        Next.js 16 (App Router, Cache Components, Tailwind v4)    :3000
  api/        NestJS 12 (ESM, Zod validation, Vitest)                    :4000
packages/
  contracts/  Zod schemas + types shared by web and api
  database/   Repository interfaces + adapters: supabase | postgres | memory
  fixtures/   The fictional Larkspur IT workspace, for tests only
supabase/     Supabase CLI project: config and migrations
```

## Quick start

Prerequisites: Node 22.12+ (see `.nvmrc`), pnpm 10, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
pnpm install
pnpm db:start            # local Supabase in Docker, with the migrations applied

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/database/.env.example packages/database/.env   # optional: DB integration tests
```

In `apps/api/.env`:

- paste the **Secret** key printed by `pnpm db:status` into `SUPABASE_SECRET_KEY` (and into `packages/database/.env` for the integration tests). It is a shared local default, but keys stay out of the repo;
- set `CONNECTOR_SECRET_KEY` to the output of `openssl rand -base64 32`. It encrypts your tools' credentials.

```bash
pnpm dev                 # web on :3000, api on :4000, packages rebuild on change
```

Open http://localhost:3000. A new Dossier starts empty and sends you to **/setup** to create your workspace and account; from there, connect your tools on **Connections**.

Local Supabase uses ports **553xx** (API 55321, DB 55322, Studio 55323) so it doesn't clash with other projects on the default 543xx ports. No Docker? Set `DATABASE_PROVIDER=memory` in `apps/api/.env`; the API then keeps everything in memory and forgets it on restart.

## How a request flows

```
Browser ──▶ Next.js server ──HTTP──▶ NestJS API ──▶ repositories ──▶ adapter ──▶ database
            (Server Components,       (controllers,   (interfaces in    (supabase /
             Server Actions)           services)       @dossierhq/database) postgres / memory)
```

- **The browser never talks to the database or to Supabase.** Pages and Server Actions reach the API through [`apps/web/src/lib/data`](apps/web/src/lib/data/index.ts), which is server-only.
- **The API never imports a driver.** Feature modules inject `DATABASE` and use its repositories (`db.reports`, `db.clients`…). [`DatabaseModule`](apps/api/src/database/database.module.ts) is the only place that knows which database is in use.
- **One set of shapes.** Requests and responses are defined once in `@dossierhq/contracts`: the API validates with them and the web app parses responses with them.
- **Every request acts on one workspace: the signed-in session's.** Controllers take it with `@WorkspaceId()` ([`common/workspace.ts`](apps/api/src/common/workspace.ts)); nothing reads it from the request body or URL.

## The API

Lists come back as `{ "data": [...] }`. Unknown IDs return 404 and invalid input returns 400 with the failing fields.

| Endpoint                                                    | What it does                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /health`                                               | API and database status (503 when the database is down)      |
| `GET /setup`, `POST /setup`                                 | Whether first-run setup is open; create workspace and owner  |
| `POST /auth/sign-in`, `POST /auth/sign-out`, `GET /auth/me` | Start or end a session; who is signed in, to which workspace |
| `GET /workspace`, `GET /clock`                              | The workspace, and the moment the data describes             |
| `GET /clients`, `/clients/overview`, `/clients/recent`      | Clients by name; with attention, meeting and report; recents |
| `GET /clients/:id`, `/clients/:id/sources`                  | One client; everything read about it                         |
| `POST /clients/:id/views`                                   | Records that the user opened the client                      |
| `GET /attention`, `/commitments`, `/meetings`, `/devices`   | Each takes an optional `?clientId=`                          |
| `GET /recommendations`, `PATCH /recommendations/:id`        | List (`clientId`, `status`); accept, dismiss, undo or edit   |
| `GET /reports`, `/reports/queue`, `/reports/:id`            | Summaries (`clientId`, `status`); review queue; full report  |
| `PATCH /reports/:id`, `POST /reports/status`                | Approve, skip or reopen one report, or many at once          |
| `GET /sources?ids=a,b`                                      | Sources in the order asked                                   |
| `GET /connectors`, `GET /audit`                             | Connected tools; reads made (`tool`, `clientId`)             |
| `PUT /connectors/:tool`, `DELETE /connectors/:tool`         | Connect (or update credentials); disconnect. Owners only     |
| `POST /connectors/:tool/sync`                               | Start a sync now (202)                                       |

Everything except `/health`, `/setup` and `/auth/sign-in` needs `Authorization: Bearer <token>` and returns 401 without a live session.

## Sign-in

Accounts live in our own tables (`users`, `workspace_members`, `sessions`), so sign-in works the same on every database adapter and adds no dependencies.

- **Passwords** are hashed with scrypt from `node:crypto` ([`auth/password.ts`](apps/api/src/auth/password.ts)). Emails are stored lowercase.
- **Sessions** are random 32-byte tokens. The database keeps only their SHA-256, and they last `SESSION_DAYS` (default 30) in `apps/api/.env`. Sign-out deletes the row.
- **Failed attempts:** after 5 failures for one email in 15 minutes, further attempts get 429 for the rest of the window. Unknown emails take as long to reject as wrong passwords.
- **In the web app**, the token sits in an httpOnly `dossier_session` cookie, and the browser never sees the API. [`proxy.ts`](apps/web/src/proxy.ts) sends anyone without a cookie to `/sign-in?next=…`. When the API rejects a session, [`lib/api.ts`](apps/web/src/lib/api.ts) redirects to `/sign-in?expired=1&next=…`, so signing in again returns to the same page.
- **First run:** while there are no users at all, `/setup` creates the workspace and its owner (atomically, so two people can't both claim it) and signs them in. After that it's closed for good.

There are no invitations or password resets yet. To add a user by hand, insert a `users` row with a hash from `hashPassword()` and a `workspace_members` row.

## Integrations

Dossier reads from four tools and never writes to them. Connect them on **Connections** (owners only); each form explains how to create credentials that can only read.

| Tool       | Credentials                                                                                              | What Dossier reads                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| NinjaOne   | Region, client ID and secret (machine-to-machine app, Monitoring scope)                                  | Organizations → clients; devices, patch status, active alerts                                      |
| Hudu       | Your Hudu address and an API key                                                                         | Companies → clients (with town and website domain); assets, websites, expirations. Never passwords |
| SharePoint | Entra app: tenant ID, client ID, secret (`Sites.Read.All` or `Sites.Selected`); site, library and folder | Files in each client's folder                                                                      |
| Fathom     | An API key                                                                                               | Client meetings from the last 90 days and the action items the MSP took on                         |

**How clients come together.** NinjaOne organizations and Hudu companies create clients; the same name in both (ignoring case, punctuation and suffixes like "Ltd") is one client. SharePoint folders join the client with the same name, and Fathom meetings join the client whose domain the outside invitees use (from Hudu websites, or the client's name, e.g. `harbourdental.co.uk` → Harbour Dental). Neither creates clients.

**Syncing.** Every connected tool syncs every `SYNC_INTERVAL_MINUTES` (default 15), shortly after the API starts, and on **Sync now**. Syncs for a workspace run one at a time, and each swaps that tool's records in one transaction (the `replace_tool_records` SQL function), so a sync never leaves half its data. Every read goes in the audit log, kept for 90 days.

**Attention items** come from rules over what was read:

- NinjaOne: active alerts (critical/major severity sets urgency), servers offline for 30 minutes or more, and failed patching per client.
- Hudu: anything expiring in the next 30 days or expired in the last 30.
- Fathom: action items still open two weeks after the meeting.
- Any tool: a sync that fails. The last good records stay, the connector shows what went wrong in plain words, and the item clears on the next good sync.

Recommendations, weekly reports and what clients planned, worried about or asked for in meetings need the intelligence layer, which isn't built yet, so those sections stay empty.

**Credentials** are checked with the tool before they're saved, encrypted with AES-256-GCM using `CONNECTOR_SECRET_KEY`, and never returned by the API. Changing the key means connecting each tool again. In production, Hudu addresses must be https and must not point into a private network.

**Disconnecting** removes the credentials and everything read from that tool, including clients that only it knew about.

The connectors are in [`apps/api/src/integrations/tools`](apps/api/src/integrations/tools); the tests run them against fakes of all four APIs ([`test/fake-tools.ts`](apps/api/test/fake-tools.ts)), built from each tool's documented responses. `NINJAONE_API_URL`, `FATHOM_API_URL`, `MICROSOFT_LOGIN_URL` and `MICROSOFT_GRAPH_URL` point a tool somewhere else, which is only for testing.

## Test data

[`@dossierhq/fixtures`](packages/fixtures/src/index.ts) holds a fictional workspace, Larkspur IT: 14 clients, 931 sources, 56 weekly reports, 567 devices and the rest. Only tests use it:

- every database adapter's contract suite checks its answers against it. The SQL suites load it into the database you point them at, then remove it (and anything else they made) afterwards, so your own data is left alone;
- the API's e2e tests run the app on the memory adapter holding it.

It is never loaded into a running Dossier. To preview empty, error and loading states in the web app, set `PREVIEW_STATE=empty`, `error` or `slow` in `apps/web/.env.local` and restart the dev server.

## Switching databases

Set `DATABASE_PROVIDER` in `apps/api/.env` and restart the API:

| Provider             | Talks to                                                                   | Variables                                                                    |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `supabase` (default) | Supabase Data API (PostgREST) using a server-side secret key               | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`                                        |
| `postgres`           | Any Postgres over SQL: Supabase direct/pooler, Neon, RDS, Cloud SQL, local | `DATABASE_URL`, optional `DATABASE_POOL_MAX`, `DATABASE_PREPARED_STATEMENTS` |
| `memory`             | Process memory; starts empty and forgets everything on restart             | none                                                                         |

Misconfiguration stops the API at boot with a message naming the missing variable.

> Behind a transaction-mode pooler, such as Supabase's port 6543, set `DATABASE_PREPARED_STATEMENTS=false`.

## Adding another database

Say you want MySQL, MongoDB or DynamoDB:

1. **Config.** In [`packages/database/src/config.ts`](packages/database/src/config.ts), add the provider to `DATABASE_PROVIDERS`, add a Zod schema to `databaseConfigSchema`, and map its env vars in `envSchemas`.
2. **Adapter.** Create `packages/database/src/adapters/<name>/index.ts` returning a `DatabaseAdapter` (see [`types.ts`](packages/database/src/types.ts)). Sort with the rules in [`ordering.ts`](packages/database/src/ordering.ts) so results match the other adapters.
3. **Register.** Add a `case` to [`create-database.ts`](packages/database/src/create-database.ts). TypeScript fails the build until you do, and adapters load lazily, so unused drivers are never imported.
4. **Prove it.** Add `adapters/<name>/<name>.test.ts` calling `describeDatabaseContract(...)`, with a `prepare` that loads the test workspace. It checks every repository against it; once it's green the API and web app work unchanged.

## Adding a resource

1. **Contract.** Zod schemas and types in `packages/contracts/src`, plus request shapes in `api.ts`.
2. **Schema.** A migration (`pnpm db:migration <name>`), then `pnpm db:reset` and `pnpm db:types`.
3. **Repository.** An interface in `packages/database/src/types.ts`, a row mapper in `rows.ts`, an ordering in `ordering.ts`, an implementation in each adapter, and cases in the contract suite.
4. **Test data.** Add it to `@dossierhq/fixtures` and to its SQL in `sql.ts`.
5. **API.** A controller (and a service if there are rules) in the right feature module, plus e2e cases.
6. **Web.** A function in `apps/web/src/lib/data`, and a Server Action in `app/actions.ts` for changes.

## Database migrations

`supabase/migrations` holds plain SQL and is the single source of truth for both SQL adapters. It needs Postgres 15+.

```bash
pnpm db:migration add_tags     # new timestamped file in supabase/migrations
pnpm db:reset                  # rebuild the local database from the migrations (empty)
pnpm db:types                  # regenerate the Supabase adapter's typed schema
supabase db push               # apply to the linked Supabase project
supabase db push --db-url "$DATABASE_URL"   # …or to any Postgres
```

## Scripts

| Command                                   | What it does                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                                | Run everything in watch mode                                               |
| `pnpm build`                              | Build all packages and apps (cached by Turborepo)                          |
| `pnpm typecheck` / `pnpm lint`            | Type-check / lint (oxlint for TS packages, ESLint for Next)                |
| `pnpm test`                               | Unit tests, plus DB integration tests when `packages/database/.env` exists |
| `pnpm test:e2e`                           | Boots the real API on the memory adapter and exercises it over HTTP        |
| `pnpm db:start` / `db:stop` / `db:status` | Manage the local Supabase stack                                            |
| `pnpm format`                             | Prettier                                                                   |

Run a single workspace with a filter, e.g. `pnpm --filter @dossierhq/api dev`.

## Notes

- **Everything is ESM.** NestJS 12 is ESM-only. Relative imports in the API and packages use `.js` extensions (`nodenext`).
- **TypeScript is pinned to 6.0.** `@nestjs/cli` 12 is built on the TypeScript 6 compiler API, so don't move to TypeScript 7 until Nest supports it.
- **Hot reload across packages.** Packages compile to `dist/` with `tsc --watch`, and the API runs under `node --watch`, so editing `packages/*` restarts it.
- **Security.** Row Level Security is on for every table with no policies, and Supabase's browser roles have their grants revoked, so only the API's server-side key can read or write. The `client_overview` view runs with the caller's permissions.
- **One API instance per database.** Syncs are scheduled and queued in process. To run several API instances, move scheduling to a job queue first.
- **Not wired yet.** Meeting notes and Ask are still UI-only; they need a manual-notes source and the intelligence layer.
