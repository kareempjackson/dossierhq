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
- set `CONNECTOR_SECRET_KEY` to the output of `openssl rand -base64 32`. It encrypts your tools' credentials;
- optionally, set `ANTHROPIC_API_KEY` so Dossier can draft with Claude. Without it, everything else still works;
- optionally, set `MAIL_PROVIDER=postmark` with `MAIL_FROM` and `POSTMARK_SERVER_TOKEN` to send email. Until then, emails such as password resets are written to the API's log instead.

```bash
pnpm dev                 # web on :3000, api on :4000, packages rebuild on change
```

Open http://localhost:3000. Signed out, `/` is the landing page; **Create your workspace** (`/sign-up`) makes a workspace with you as its owner, and from there you connect your tools on **Connections**. Anyone can sign up, and each sign-up gets a workspace of its own.

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

| Endpoint                                                      | What it does                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /health`                                                 | API and database status (503 when the database is down)                    |
| `POST /auth/sign-up`                                          | Create a workspace and its owner, and sign them in                         |
| `POST /auth/sign-in`, `POST /auth/sign-out`, `GET /auth/me`   | Start or end a session; who is signed in, to which workspace               |
| `POST /auth/password-reset`, `/auth/password-reset/confirm`   | Email a reset link (202 either way); set a new password with its token     |
| `POST /auth/invites/preview`, `/auth/invites/accept`          | What an invite is for; accept it: create the account and sign in           |
| `GET /workspace`, `GET /clock`                                | The workspace, and the moment the data describes                           |
| `GET /clients`, `/clients/overview`, `/clients/recent`        | Clients by name; with attention, meeting and report; recents               |
| `GET /clients/:id`, `/clients/:id/sources`                    | One client; everything read about it                                       |
| `POST /clients/:id/views`                                     | Records that the user opened the client                                    |
| `GET /attention`, `/commitments`, `/meetings`, `/devices`     | Each takes an optional `?clientId=`                                        |
| `GET /recommendations`, `PATCH /recommendations/:id`          | List (`clientId`, `status`); accept, dismiss, undo or edit                 |
| `GET /reports`, `/reports/queue`, `/reports/:id`              | Summaries (`clientId`, `status`); review queue; full report                |
| `PATCH /reports/:id`, `POST /reports/status`                  | Approve, skip or reopen one report, or many at once                        |
| `POST /reports`                                               | Draft this week's report now: one client (`clientId`) or all               |
| `GET /report-questions`, `POST /report-questions`             | Questions reports answer (`clientId`: theirs and everyone's)               |
| `PATCH /report-questions/:id`, `DELETE /report-questions/:id` | Change or remove a question                                                |
| `GET /sources?ids=a,b`                                        | Sources in the order asked                                                 |
| `GET /members`; `PATCH`, `DELETE /members/:userId`            | People in the workspace; change a role or remove someone. Admins to change |
| `GET`, `POST /members/invites`, `DELETE /members/invites/:id` | Invites waiting to be accepted; invite someone; withdraw. Admins           |
| `GET /connectors`, `GET /audit`, `/audit/counts`              | Connected tools; the audit log (`kind`, `tool`, `clientId`) and counts     |
| `PUT /connectors/:tool`, `DELETE /connectors/:tool`           | Connect (or update credentials); disconnect. Admins                        |
| `POST /connectors/:tool/sync`                                 | Start a sync now (202)                                                     |
| `GET /intelligence`, `PUT /intelligence`                      | Drafting model and 30-day spend; choose the model. Admins to change        |
| `POST /intelligence/draft`                                    | Draft every client's recommendations now (202). Admins                     |
| `PUT /intelligence/preferences`                               | What Dossier drafts, looks for and may read. Admins                        |

Everything except `/health`, sign-up, sign-in, password reset and accepting invites needs `Authorization: Bearer <token>` and returns 401 without a live session.

## Sign-in

Accounts live in our own tables (`users`, `workspace_members`, `sessions`), so sign-in works the same on every database adapter and adds no dependencies.

- **Passwords** are hashed with scrypt from `node:crypto` ([`auth/password.ts`](apps/api/src/auth/password.ts)). Emails are stored lowercase.
- **Sessions** are random 32-byte tokens. The database keeps only their SHA-256. A session ends after `SESSION_DAYS` (default 30), or sooner when it goes unused for `SESSION_IDLE_HOURS` (default 72); its last use is written at most every 5 minutes, and ended sessions are deleted hourly. Sign-out deletes the row. **Settings → Your sign-in** shows how many other browsers are signed in, signs out everywhere else, and emails a link to change the password.
- **Rate limits** ([`auth/rate-limits.ts`](apps/api/src/auth/rate-limits.ts)) live in the database (`rate_limit_hits`), so they hold across restarts and API instances: 5 failed sign-ins per email and 20 per address in 15 minutes, 5 sign-ups per address an hour, 3 reset emails per email and 10 per address an hour, and 20 invites per workspace a day. Emails count whether or not they have an account, so a lockout never reveals which do, and unknown emails take as long to reject as wrong passwords. Buckets store a SHA-256 of the email or address, and rows older than a day are pruned hourly.
- **Visitors' addresses:** the browser never reaches the API, so the API can't see who is signing in. With `CLIENT_IP_KEY` set to the same value in `apps/api/.env` and `apps/web/.env.local`, the web app passes the visitor's address on (the last entry in `x-forwarded-for`, which Next fills from the socket when no proxy has) with the key beside it, and the API trusts it only then. Per-address limits and the addresses on sign-ins in the audit log need it; without it they're skipped. Run the web app behind your host's proxy (as on Vercel) rather than reachable directly, or visitors can claim any address.
- **Password reset:** **Forgot your password?** on sign-in emails a link that works once, for an hour. Asking again replaces any unused link, and one address gets at most 3 an hour. The API answers 202 at once whether or not the email has an account, then looks it up and sends. Like sessions, only a SHA-256 of the link's token is stored. Choosing the new password ends every session the person had and signs them in.
- **Roles:** `owner`, `admin` and `technician`. Owners and admins manage connections and how Dossier drafts; technicians do the weekly work (reports, recommendations, syncing). A route asks for a role with `@RequireRole('admin', 'change connections')` ([`auth/role.decorator.ts`](apps/api/src/auth/role.decorator.ts)), which `AuthGuard` checks against the database on every request, so a changed role applies at once. Everyone else gets 403 "Only owners and admins can change connections."
- **In the web app**, the token sits in an httpOnly `dossier_session` cookie, and the browser never sees the API. [`proxy.ts`](apps/web/src/proxy.ts) shows anyone without a cookie the landing page at `/` (served from `/welcome`) and sends them to `/sign-in?next=…` from anywhere else except `/sign-up`. When the API rejects a session, [`lib/api.ts`](apps/web/src/lib/api.ts) redirects to `/sign-in?expired=1&next=…`, so signing in again returns to the same page.
- **Sign-up** is open to anyone. It creates a workspace and its owner in one step (the `create_owner` SQL function), signs them in and sends them to **Connections**. One account per email: signing up with an email that already has an account returns 409 and changes nothing. Every repository call takes the session's workspace, so workspaces never see each other's clients, connections or records.

- **Invites:** owners and admins invite people from **Settings** as admins or technicians. The email's link works for 7 days and once; inviting the same email again replaces the invite, and a workspace can send 20 a day, so open sign-up can't be used to email strangers. Accepting (`accept_invite`, one SQL transaction) creates the account with the invited email and role and signs in. Only owners make someone an owner or change or remove one, and a workspace always keeps an owner. Removing someone (`remove_member`) ends their sessions and deletes their account, so they can be invited again.

Each person belongs to one workspace for now: inviting an email that already has an account returns 409. There is no email verification yet, and nothing limits sign-ups beyond one per email.

**Email** goes through one `Mailer` ([`apps/api/src/mail`](apps/api/src/mail/mailer.ts)), chosen by `MAIL_PROVIDER`: `log` (the default) writes each email, links included, to the API's log and sends nothing; `postmark` sends through Postmark's transactional stream, with open and link tracking off. Links in emails point at `WEB_URL` (default `http://localhost:3000`).

## Audit log

One log ([`apps/api/src/audit`](apps/api/src/audit/audit-log.ts)) holds three kinds of entry, each with who did it and whether it worked:

- **Reads** from connected tools, written by syncs: what was read, for which client, how many records. Checking credentials and a sync that stops are reads too, marked failed. Nobody did them, so they show as Dossier.
- **Sign-ins:** signing in and out, wrong passwords, lockouts, sign-up, and password reset requests and resets. Failed attempts are written after the answer, so a known email takes no longer to reject than an unknown one; attempts on emails with no account aren't kept.
- **Changes** people make: connecting, changing or disconnecting a tool, syncing now, attaching meetings, drafting, approving, skipping or reopening reports, deciding or editing recommendations, report questions, and how Dossier drafts.

A feature records a change with `AuditLog.record(workspaceId, userId, { kind: 'change', what: 'Approved…', clientId })`, which never throws. Each entry keeps the person's name and email as they were. Reads are kept for `AUDIT_READ_DAYS` (default 90), sign-ins and changes for `AUDIT_EVENT_DAYS` (default 365), and a client's entries stay after the client is removed. Owners and admins see everything on **Audit log**; technicians see reads only, and the API answers 403 if they ask for the rest.

## Integrations

Dossier reads from four tools and never writes to them. Connect them on **Connections** (owners and admins); each form explains how to create credentials that can only read.

| Tool       | Credentials                                                                                                                                                    | What Dossier reads                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| NinjaOne   | Region, client ID and secret of a Web app (Monitoring scope), then a technician signs in. Without signing in, an API Services app reads everything but tickets | Organizations → clients; devices, patch status, active alerts; tickets (open, and closed in the last 90 days) |
| Hudu       | Your Hudu address and an API key                                                                                                                               | Companies → clients (with town and website domain); assets, websites, expirations. Never passwords            |
| SharePoint | Entra app: tenant ID, client ID, secret (`Sites.Read.All` or `Sites.Selected`); site, library and folder                                                       | Files in each client's folder                                                                                 |
| Fathom     | An API key                                                                                                                                                     | Client meetings from the last 90 days, Fathom's summary of each, and the action items the MSP took on         |

**How clients come together.** NinjaOne organizations and Hudu companies create clients; the same name in both (ignoring case, punctuation and suffixes like "Ltd") is one client. SharePoint folders join the client with the same name, and Fathom meetings join the client whose domain the outside invitees use (from Hudu websites, or the client's name, e.g. `harbourdental.co.uk` → Harbour Dental). Neither creates clients.

**Syncing.** Every connected tool syncs every `SYNC_INTERVAL_MINUTES` (default 15), shortly after the API starts, and on **Sync now**. Syncs for a workspace run one at a time, and each swaps that tool's records in one transaction (the `replace_tool_records` SQL function), so a sync never leaves half its data. Every read goes in the audit log, including credential checks and syncs that stop partway.

**Attention items** come from rules over what was read:

- NinjaOne: active alerts (critical/major severity sets urgency), servers offline for 30 minutes or more, failed patching per client, and open tickets of high priority or major/critical severity.
- Hudu: anything expiring in the next 30 days or expired in the last 30.
- Fathom: action items still open two weeks after the meeting.
- Any tool: a sync that fails. The last good records stay, the connector shows what went wrong in plain words, and the item clears on the next good sync.

**Weekly reports** are drafted on demand: **Draft reports now** on Reports, or **Draft this week's report** on a client. The drafter ([`reports/drafter.ts`](apps/api/src/reports/drafter.ts)) writes up what the last syncs read, by rules, one line per record: attention items under Needs attention; the devices by type, and each one behind on updates or gone quiet, with its user and OS; every active alert, with its device and since when; a Helpdesk section with each open ticket's status, requester, priority and technician; each ticket resolved this week and how long it took; meetings with who attended and what came up; and open action items with when they were agreed and are due. Past 12 records, a section sums up the rest in one line. Every line cites its records. Counts cite a snapshot of the count that links to the client in NinjaOne. Each report keeps a copy of what it cites, so its citations hold after later syncs change or drop those records. A week's draft is replaced and keeps its ID; approved reports are never redrafted, and drafting every client also leaves the skipped ones. Nothing drafts them on a schedule yet.

**Report questions** (**Reports → Questions**) are questions you want every report, or one client's, to answer, such as "Is anyone still on Windows 10?". When a report is drafted, Claude answers each from that client's records ([`reports/question-answerer.ts`](apps/api/src/reports/question-answerer.ts)) under **Your questions**, citing the records it used, and the report keeps a copy of them like the rest. Drafting returns at once; the answers follow in the background, three clients at a time, and the report page refreshes until they're in. Until then the report counts as an exception, so **Approve all clean** leaves it alone. An answer the records can't support keeps no citations, so the reviewer sees it and approving leaves it out. Answering needs `ANTHROPIC_API_KEY`; without it, each question says it wasn't answered and why.

**Recommendations** are drafted by Claude ([`apps/api/src/intelligence`](apps/api/src/intelligence)). About a minute after a workspace's syncs settle, Dossier turns each client's records into a _context pack_: a compact text version of the client, its attention items, promises, meetings, tickets, devices, documentation and files, with every fact tagged by a handle like `[S3]` that points to its source ([`pack.ts`](apps/api/src/intelligence/pack.ts)). Claude reads the pack and suggests up to five actions, each citing handles; Dossier maps them back to sources and drops anything uncited. A client is only drafted for again when its pack changes, or after a day. New drafts replace the earlier ones nobody touched; accepted, dismissed and edited ones stay, and Claude is shown them so it doesn't repeat them. Synced text is passed to Claude as data, never as instructions, and secret-looking fields are left out.

**Intelligence** (in the sidebar) is where owners and admins choose what Dossier does with Claude, in three groups of switches. **What Dossier drafts**: recommendations and report questions (meeting notes, Ask and patterns across clients show as coming soon); an output that's off makes no calls and costs nothing. **What to look for**: topics such as backups, patching, security or renewals; recommendations only cover the topics that are on. **What Claude may read**: devices and alerts, tickets, meetings, Hudu documentation and SharePoint file names; a kind that's off, and anything citing it, is left out of every context pack, so it never reaches Anthropic, and Claude is told it's held back rather than missing. Anything never switched is on.

**Settings** is where owners and admins pick the model: Claude Opus 5.5 by default, or Sonnet 5.5, Haiku 5.5 or Fable 5.1, each shown with Anthropic's prices per million tokens and what one client's draft would cost, along with the last 30 days' spend. Every model fact lives in one list, [`packages/contracts/src/models.ts`](packages/contracts/src/models.ts): to offer another model or update a price, edit it there. `INTELLIGENCE_MODEL` sets the default for a workspace that hasn't chosen. Every run, including Report questions, is logged in `intelligence_runs` with its tokens and cost.

What clients planned, worried about or asked for in meetings still needs drafting, so those sections stay empty.

**Credentials** are checked with the tool before they're saved, encrypted with AES-256-GCM using `CONNECTOR_SECRET_KEY`, and never returned by the API. Changing the key means connecting each tool again. In production, Hudu addresses must be https and must not point into a private network.

**Disconnecting** removes the credentials and everything read from that tool, including clients that only it knew about.

The connectors are in [`apps/api/src/integrations/tools`](apps/api/src/integrations/tools); the tests run them against fakes of all four APIs ([`test/fake-tools.ts`](apps/api/test/fake-tools.ts)), built from each tool's documented responses. `NINJAONE_API_URL`, `FATHOM_API_URL`, `MICROSOFT_LOGIN_URL` and `MICROSOFT_GRAPH_URL` point a tool somewhere else, which is only for testing.

## Test data

[`@dossierhq/fixtures`](packages/fixtures/src/index.ts) holds a fictional workspace, Larkspur IT: 14 clients, 931 sources, 56 weekly reports, 567 devices and the rest. Only tests use it:

- every database adapter's contract suite checks its answers against it. The SQL suites load it into the database you point them at, then remove it (and anything else they made) afterwards, so your own data is left alone;
- the API's e2e tests run the app on the memory adapter holding it.

It is never loaded into a running Dossier. To preview empty, error and loading states in the web app, set `PREVIEW_STATE=empty`, `error` or `slow` in `apps/web/.env.local` and restart the dev server.

## Tenant isolation

Every repository call takes the session's workspace and filters by it. With the `postgres` adapter connected as **`dossier_app`**, the database enforces that too, so a query that forgets its filter still can't reach another workspace:

- Each workspace call runs in a transaction that first sets `app.workspace_id`. Row level security on every tenant table (clients, sources, reports, connectors, the audit log and the rest) lets `dossier_app` read and write only rows of that workspace, and nothing when it isn't set.
- Accounts, memberships, sessions, password resets and rate limits come before a workspace is known (signing in), so `dossier_app` may use them whole. The three reads that cross workspaces go through narrow `security definer` functions: `connected_tools()` for the sync scheduler, `find_invite()` and `accept_invite()` for invite links.
- `row-security.test.ts` checks every tenant table hides other workspaces' rows, and that every table has row security on with a policy for `dossier_app`, so a new table can't be added without one.

To run this way, give the role a password and point the API at it:

```sql
alter role dossier_app with password '…';   -- in the Supabase SQL editor, or psql as postgres
```

```bash
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://dossier_app.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres
DATABASE_PREPARED_STATEMENTS=false   # transaction-mode pooler
```

`app.workspace_id` is set per transaction, so it's safe behind a transaction-mode pooler. The owner (`postgres`) and Supabase's `service_role` bypass row level security, so the `supabase` adapter, and `postgres` connected as `postgres`, rely on the API's filters alone: fine for development, not for production. To run the contract suite as `dossier_app`, set `DATABASE_APP_URL` in `packages/database/.env`.

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
- **Security.** Supabase's browser roles have their grants revoked, so only the API can read or write. Tenant isolation is enforced by the database for the `postgres` adapter connected as `dossier_app` (see [Tenant isolation](#tenant-isolation)); the `client_overview` view runs with the caller's permissions, so it obeys the same rules.
- **One API instance per database.** Syncs are scheduled and queued in process. To run several API instances, move scheduling to a job queue first.
- **Not wired yet.** Meeting notes and Ask are still UI-only; they need a manual-notes source and the intelligence layer.
