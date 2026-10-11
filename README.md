# DossierHQ

pnpm + Turborepo monorepo: a **Next.js 16** frontend (Tailwind CSS v4), a **NestJS 12** API, and a database layer that runs on **Supabase** today and can switch to another database with one environment variable.

```
apps/
  web/        Next.js 16 (App Router, Cache Components, Tailwind v4)    :3000
  api/        NestJS 12 (ESM, Zod validation, Vitest)                    :4000
packages/
  contracts/  Zod schemas + types shared by web and api
  database/   Repository interfaces + adapters: supabase | postgres | memory
supabase/     Supabase CLI project: config, migrations, seed
```

## Quick start

Prerequisites: Node 22.12+ (see `.nvmrc`), pnpm 10, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
pnpm install
pnpm db:start            # local Supabase in Docker; applies migrations + seed

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/database/.env.example packages/database/.env   # optional: DB integration tests

pnpm dev                 # web on :3000, api on :4000, packages rebuild on change
```

Then paste the **Secret** key printed by `pnpm db:status` into `SUPABASE_SECRET_KEY` in `apps/api/.env` (and `packages/database/.env` for the integration tests). It is a shared local default, but keys stay out of the repo. Local Supabase uses ports **553xx** (API 55321, DB 55322, Studio 55323) so it doesn't clash with other projects on the default 543xx ports.

## How a request flows

```
Browser ──▶ Next.js server ──HTTP──▶ NestJS API ──▶ NotesRepository ──▶ adapter ──▶ database
            (Server Components,       (controllers,     (interface in       (supabase /
             Server Actions)           services)         @dossierhq/database) postgres / memory)
```

- The browser never talks to the database or to Supabase directly. Pages and Server Actions call the API through `apps/web/src/lib/api.ts`, which is server-only.
- Feature code in the API injects repositories by token (`NOTES_REPOSITORY`) and never imports a driver. [`DatabaseModule`](apps/api/src/database/database.module.ts) is the only place that knows which database is in use.
- Request and response shapes come from `@dossierhq/contracts`. The API validates with them (`ZodValidationPipe`) and the web app parses responses with the same schemas.

## Web app data

The web app currently runs on typed mock data. Every page reads through [`apps/web/src/lib/data`](apps/web/src/lib/data/index.ts), which is the one place to point at the API later. Domain types live in `@dossierhq/contracts` so the API can reuse them.

To preview empty, error and loading states, set `MOCK_SCENARIO=empty`, `error` or `slow` in `apps/web/.env.local` and restart the dev server.

## Switching databases

Set `DATABASE_PROVIDER` in `apps/api/.env` and restart the API:

| Provider             | Talks to                                                                   | Variables                                                                    |
| -------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `supabase` (default) | Supabase Data API (PostgREST) using a server-side secret key               | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`                                        |
| `postgres`           | Any Postgres over SQL: Supabase direct/pooler, Neon, RDS, Cloud SQL, local | `DATABASE_URL`, optional `DATABASE_POOL_MAX`, `DATABASE_PREPARED_STATEMENTS` |
| `memory`             | Process memory. Good for tests and running without a database              | none                                                                         |

Misconfiguration stops the API at boot with a message naming the missing variable. `GET /health` reports the active provider and whether it is reachable (it returns 503 when the database is down).

> Behind a transaction-mode pooler, such as Supabase's port 6543, set `DATABASE_PREPARED_STATEMENTS=false`.

## Adding another database

Say you want MySQL, MongoDB or DynamoDB:

1. **Config.** In [`packages/database/src/config.ts`](packages/database/src/config.ts), add the provider to `DATABASE_PROVIDERS`, add a Zod schema to `databaseConfigSchema`, and map its env vars in `envSchemas`.
2. **Adapter.** Create `packages/database/src/adapters/<name>/index.ts` exporting a function that returns a `DatabaseAdapter` (see [`types.ts`](packages/database/src/types.ts)). Copy the shape of the memory or postgres adapter.
3. **Register.** Add a `case` to [`create-database.ts`](packages/database/src/create-database.ts). TypeScript fails the build until you do, and the adapter loads lazily, so the other drivers are never imported.
4. **Prove it.** Add `adapters/<name>/<name>.test.ts` that calls `describeNotesRepositoryContract(...)`. It's the same suite every adapter passes, and once it's green the API and web app work unchanged.
5. **Export it.** Optionally add a `./<name>` subpath to `packages/database/package.json`.

## Adding a resource (a new table)

1. **Contract.** Add Zod schemas and types in `packages/contracts/src/<resource>.ts`.
2. **Repository.** Add a repository interface in `packages/database/src/types.ts` and a property for it on `DatabaseAdapter`.
3. **Implement.** Implement it in every adapter, then extend the contract tests.
4. **Migrate.** Add a migration with `pnpm db:migration <name>`, apply it with `pnpm db:reset`, and refresh the types with `pnpm db:types`.
5. **API.** Add a token in `apps/api/src/database/database.tokens.ts`, provide it in `DatabaseModule`, and build the Nest module. Use `apps/api/src/notes` as the template.

`notes` is the reference resource that shows the whole path. Rename or delete it once you have real ones.

## Database migrations

`supabase/migrations` holds plain SQL and is the single source of truth for both SQL adapters. It runs on any Postgres 13+.

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
| `pnpm format`                             | Prettier                                                                   |
| `pnpm db:start` / `db:stop` / `db:status` | Manage the local Supabase stack                                            |

Run a single workspace with a filter, e.g. `pnpm --filter @dossierhq/api dev`.

## Notes

- **Everything is ESM.** NestJS 12 is ESM-only. Relative imports in the API and packages use `.js` extensions (`nodenext`).
- **TypeScript is pinned to 6.0.** `@nestjs/cli` 12 is built on the TypeScript 6 compiler API, so don't move to TypeScript 7 until Nest supports it.
- **Hot reload across packages.** Packages compile to `dist/` with `tsc --watch`, and the API runs under `node --watch`, so editing `packages/*` restarts it.
- **Security.** Row Level Security is enabled on `notes` with no policies. Only the API's server-side key can read or write. Add policies if the browser should ever query Supabase directly.
