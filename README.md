# DossierHQ

pnpm + Turborepo monorepo for Dossier: a **Next.js 16** frontend (Tailwind CSS v4), a **NestJS 12** API, and a database layer that runs on **Supabase** today and can switch to another database with one environment variable.

```
apps/
  web/        Next.js 16 (App Router, Cache Components, Tailwind v4)    :3000
  api/        NestJS 12 (ESM, Zod validation, Vitest)                    :4000
packages/
  contracts/  Zod schemas + types shared by web and api
  database/   Repository interfaces + adapters: supabase | postgres | memory
  fixtures/   The Larkspur IT demo workspace: seeds Supabase, memory and tests
supabase/     Supabase CLI project: config, migrations, generated seed
```

## Quick start

Prerequisites: Node 22.12+ (see `.nvmrc`), pnpm 10, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
pnpm install
pnpm db:start            # local Supabase in Docker; applies migrations + the demo seed

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/database/.env.example packages/database/.env   # optional: DB integration tests

pnpm dev                 # web on :3000, api on :4000, packages rebuild on change
```

Open http://localhost:3000 and choose **Use demo account** (`sam@larkspur-it.example` / `larkspur-demo`).

Then paste the **Secret** key printed by `pnpm db:status` into `SUPABASE_SECRET_KEY` in `apps/api/.env` (and `packages/database/.env` for the integration tests). It is a shared local default, but keys stay out of the repo. Local Supabase uses ports **553xx** (API 55321, DB 55322, Studio 55323) so it doesn't clash with other projects on the default 543xx ports.

No Docker? Set `DATABASE_PROVIDER=memory` in `apps/api/.env` and the API runs on the demo data in memory.

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

Everything except `/health` and `/auth/sign-in` needs `Authorization: Bearer <token>` and returns 401 without a live session.

`CLOCK_FIXED_AT` pins the API's clock to the moment the demo data describes, so relative times and approval stamps read as current. Remove it once you're working with real data.

## Sign-in

Accounts live in our own tables (`users`, `workspace_members`, `sessions`), so sign-in works the same on every database adapter and adds no dependencies.

- **Passwords** are hashed with scrypt from `node:crypto` ([`auth/password.ts`](apps/api/src/auth/password.ts)). Emails are stored lowercase.
- **Sessions** are random 32-byte tokens. The database keeps only their SHA-256, and they last `SESSION_DAYS` (default 30) in `apps/api/.env`. Sign-out deletes the row.
- **Failed attempts:** after 5 failures for one email in 15 minutes, further attempts get 429 for the rest of the window. Unknown emails take as long to reject as wrong passwords.
- **In the web app**, the token sits in an httpOnly `dossier_session` cookie, and the browser never sees the API. [`proxy.ts`](apps/web/src/proxy.ts) sends anyone without a cookie to `/sign-in?next=…`. When the API rejects a session, [`lib/api.ts`](apps/web/src/lib/api.ts) redirects to `/sign-in?expired=1&next=…`, so signing in again returns to the same page.
- **Demo account:** the fixtures seed Sam Okafor as owner of Larkspur IT. The sign-in page shows the **Use demo account** box only when `DEMO_ACCOUNT_EMAIL` and `DEMO_ACCOUNT_PASSWORD` are set in `apps/web/.env.local`. Leave them unset anywhere real people sign in.

There is no sign-up, invitation or password reset yet. To add a user, insert a `users` row with a hash from `hashPassword()` and a `workspace_members` row.

## Demo data

[`@dossierhq/fixtures`](packages/fixtures/src/index.ts) holds the fictional Larkspur IT workspace: 14 clients, 931 sources, 56 weekly reports, 567 devices and the rest. It feeds three places:

- **Supabase:** `supabase/seed.sql` is generated from it (`pnpm db:seed`), and `pnpm db:reset` loads it.
- **The memory adapter:** `DATABASE_PROVIDER=memory` starts from it (`DATABASE_SEED=empty` for nothing).
- **Tests:** every adapter's contract suite checks its answers against it.

After changing the fixtures, run `pnpm db:seed && pnpm db:reset`.

To preview empty, error and loading states in the web app without touching data, set `PREVIEW_STATE=empty`, `error` or `slow` in `apps/web/.env.local` and restart the dev server.

## Switching databases

Set `DATABASE_PROVIDER` in `apps/api/.env` and restart the API:

| Provider             | Talks to                                                                   | Variables                                                                    |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `supabase` (default) | Supabase Data API (PostgREST) using a server-side secret key               | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`                                        |
| `postgres`           | Any Postgres over SQL: Supabase direct/pooler, Neon, RDS, Cloud SQL, local | `DATABASE_URL`, optional `DATABASE_POOL_MAX`, `DATABASE_PREPARED_STATEMENTS` |
| `memory`             | Process memory, starting from the demo data                                | optional `DATABASE_SEED` (`demo` or `empty`)                                 |

Misconfiguration stops the API at boot with a message naming the missing variable.

> Behind a transaction-mode pooler, such as Supabase's port 6543, set `DATABASE_PREPARED_STATEMENTS=false`.

## Adding another database

Say you want MySQL, MongoDB or DynamoDB:

1. **Config.** In [`packages/database/src/config.ts`](packages/database/src/config.ts), add the provider to `DATABASE_PROVIDERS`, add a Zod schema to `databaseConfigSchema`, and map its env vars in `envSchemas`.
2. **Adapter.** Create `packages/database/src/adapters/<name>/index.ts` returning a `DatabaseAdapter` (see [`types.ts`](packages/database/src/types.ts)). Sort with the rules in [`ordering.ts`](packages/database/src/ordering.ts) so results match the other adapters.
3. **Register.** Add a `case` to [`create-database.ts`](packages/database/src/create-database.ts). TypeScript fails the build until you do, and adapters load lazily, so unused drivers are never imported.
4. **Prove it.** Add `adapters/<name>/<name>.test.ts` calling `describeDatabaseContract(...)`. It checks every repository against the demo data; once it's green the API and web app work unchanged.

## Adding a resource

1. **Contract.** Zod schemas and types in `packages/contracts/src`, plus request shapes in `api.ts`.
2. **Schema.** A migration (`pnpm db:migration <name>`), then `pnpm db:reset` and `pnpm db:types`.
3. **Repository.** An interface in `packages/database/src/types.ts`, a row mapper in `rows.ts`, an ordering in `ordering.ts`, an implementation in each adapter, and cases in the contract suite.
4. **Demo data.** Add it to `@dossierhq/fixtures` and to the seed generator in `sql.ts`, then `pnpm db:seed`.
5. **API.** A controller (and a service if there are rules) in the right feature module, plus e2e cases.
6. **Web.** A function in `apps/web/src/lib/data`, and a Server Action in `app/actions.ts` for changes.

## Database migrations

`supabase/migrations` holds plain SQL and is the single source of truth for both SQL adapters. It needs Postgres 15+.

```bash
pnpm db:migration add_tags     # new timestamped file in supabase/migrations
pnpm db:reset                  # rebuild local DB: migrations + seed.sql
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
| `pnpm db:seed`                            | Regenerate `supabase/seed.sql` from the fixtures                           |
| `pnpm db:start` / `db:stop` / `db:status` | Manage the local Supabase stack                                            |
| `pnpm format`                             | Prettier                                                                   |

Run a single workspace with a filter, e.g. `pnpm --filter @dossierhq/api dev`.

## Notes

- **Everything is ESM.** NestJS 12 is ESM-only. Relative imports in the API and packages use `.js` extensions (`nodenext`).
- **TypeScript is pinned to 6.0.** `@nestjs/cli` 12 is built on the TypeScript 6 compiler API, so don't move to TypeScript 7 until Nest supports it.
- **Hot reload across packages.** Packages compile to `dist/` with `tsc --watch`, and the API runs under `node --watch`, so editing `packages/*` restarts it.
- **Security.** Row Level Security is on for every table with no policies, and Supabase's browser roles have their grants revoked, so only the API's server-side key can read or write. The `client_overview` view runs with the caller's permissions.
- **Not wired yet.** Meeting notes, reconnecting a tool and Ask are still UI-only; they need a manual-notes source, secret storage and an LLM respectively.
