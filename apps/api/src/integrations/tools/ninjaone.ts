import {
  NINJAONE_REGIONS,
  type AttentionItem,
  type CredentialsFor,
  type Device,
  type NinjaOneSignIn,
  type RecordSource,
  type Ticket,
  type Urgency,
} from '@dossierhq/contracts';
import { z } from 'zod';
import type {
  ClientLookup,
  SyncContext,
  ToolConnector,
  ToolRead,
  ToolSession,
} from '../connector.js';
import { ToolError } from '../http.js';
import { DAY_MS, fromEpoch, normalizeName, oneLine } from '../ids.js';

const PAGE_SIZE = 200;
const MAX_PAGES = 500;
/** Closed tickets are kept this long after they last changed. */
const CLOSED_TICKET_DAYS = 90;
/** Read-only access, and a refresh token so later syncs can sign in. */
const SIGN_IN_SCOPE = 'monitoring offline_access';
/** NinjaOne's own statuses for finished work; custom statuses hang off them. */
const DONE_STATUSES = new Set(['RESOLVED', 'CLOSED']);

const token = z.object({
  access_token: z.string(),
  refresh_token: z.string().nullish(),
});
const organization = z.object({ id: z.number(), name: z.string() });
const device = z.object({
  id: z.number(),
  organizationId: z.number(),
  nodeClass: z.string().nullish(),
  offline: z.boolean().nullish(),
  displayName: z.string().nullish(),
  systemName: z.string().nullish(),
  dnsName: z.string().nullish(),
  created: z.number().nullish(),
  lastContact: z.number().nullish(),
  lastUpdate: z.number().nullish(),
  lastLoggedInUser: z.string().nullish(),
  os: z.object({ name: z.string().nullish() }).nullish(),
  system: z
    .object({
      chassisType: z.string().nullish(),
      manufacturer: z.string().nullish(),
      model: z.string().nullish(),
    })
    .nullish(),
});
const alert = z.object({
  uid: z.string(),
  deviceId: z.number().nullish(),
  message: z.string().nullish(),
  subject: z.string().nullish(),
  createTime: z.number().nullish(),
  sourceType: z.string().nullish(),
  conditionName: z.string().nullish(),
  severity: z.string().nullish(),
  priority: z.string().nullish(),
});
const patch = z.object({
  deviceId: z.number(),
  name: z.string().nullish(),
  status: z.string().nullish(),
  installedAt: z.number().nullish(),
  timestamp: z.number().nullish(),
});
const patchPage = z.object({
  cursor: z.object({ name: z.string().nullish() }).nullish(),
  results: z.array(patch),
});
const board = z.object({
  id: z.number(),
  name: z.string().nullish(),
  system: z.boolean().nullish(),
  ticketCount: z.number().nullish(),
});
const ticketStatus = z.object({
  name: z.string().nullish(),
  displayName: z.string().nullish(),
  parentId: z.number().nullish(),
  statusId: z.number().nullish(),
});
/** A board row has whatever columns the board shows, so it's read loosely. */
const boardRow = z.looseObject({ id: z.number() });
const boardPage = z.object({
  data: z.array(boardRow),
  metadata: z.object({ lastCursorId: z.number().nullish() }).nullish(),
});

type NinjaDevice = z.infer<typeof device>;
type NinjaAlert = z.infer<typeof alert>;
type TicketStatus = z.infer<typeof ticketStatus>;
type BoardRow = z.infer<typeof boardRow>;

const SERVER_CLASSES = new Set([
  'WINDOWS_SERVER',
  'LINUX_SERVER',
  'MAC_SERVER',
  'VMWARE_VM_HOST',
  'HYPERV_VMM_HOST',
  'NMS_SERVER',
  'NMS_VM_HOST',
]);
/** Phones, tablets, cloud monitors and the like aren't in the device list. */
const SKIPPED_CLASSES = new Set([
  'ANDROID',
  'APPLE_IOS',
  'APPLE_IPADOS',
  'AOSP',
  'CLOUD_MONITOR_TARGET',
  'UNMANAGED_DEVICE',
  'NMS_PHONE',
  'NMS_IPSLA',
  'NMS_DIAL_MANAGER',
]);

function deviceType(d: NinjaDevice): Device['type'] {
  const nodeClass = d.nodeClass ?? '';
  if (SERVER_CLASSES.has(nodeClass)) return 'server';
  if (nodeClass.startsWith('NMS_')) return 'network';
  const chassis = `${d.system?.chassisType ?? ''} ${d.system?.model ?? ''}`;
  return /laptop|notebook|portable|book/i.test(chassis)
    ? 'laptop'
    : 'workstation';
}

const deviceName = (d: NinjaDevice) =>
  d.displayName || d.systemName || d.dnsName || `Device ${d.id}`;

/** "ACME\\ann.lee" → "ann.lee". */
const userName = (value: string | null | undefined) =>
  value ? (value.split('\\').pop() ?? value) : null;

const urgencyOf = (a: {
  severity?: string | null;
  priority?: string | null;
}): Urgency => {
  const severity = (a.severity ?? '').toUpperCase();
  const priority = (a.priority ?? '').toUpperCase();
  if (severity === 'CRITICAL') return 'critical';
  if (severity === 'MAJOR' || priority === 'HIGH') return 'high';
  return 'normal';
};

const label = (value: string | null | undefined) =>
  value
    ? value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')
    : '';

/**
 * PKCE, for an app with no secret: the challenge goes to the sign-in page,
 * and only the matching verifier can trade the code that comes back.
 */
export type Pkce = { challenge: string; verifier: string };

export interface NinjaOneConnector extends ToolConnector<'ninjaone'> {
  /** NinjaOne's page where a technician signs in and lets Dossier read. */
  authorizeUrl(app: NinjaOneSignIn, state: string, pkce?: Pkce): string;
  /** Trades the code NinjaOne sent back for credentials that stay signed in. */
  finishSignIn(
    app: NinjaOneSignIn,
    code: string,
    ctx: SyncContext,
    pkce?: Pkce,
  ): Promise<CredentialsFor<'ninjaone'>>;
}

/** The app's half of a token request; an app with no secret sends only its ID. */
const appOf = (app: { clientId: string; clientSecret?: string }) => ({
  client_id: app.clientId,
  ...(app.clientSecret && { client_secret: app.clientSecret }),
});

/**
 * NinjaOne RMM: organizations become clients; devices, patch status and
 * active alerts become records. Attention items: alerts (by severity),
 * offline servers, and failed patching per client.
 *
 * Signed in as a technician (a refresh token in the credentials), it also
 * reads tickets: open ones, and closed ones from the last 90 days. NinjaOne
 * won't list tickets to an app signed in with only its client ID and secret.
 */
export function ninjaOneConnector(
  overrides: { apiUrl?: string } = {},
): NinjaOneConnector {
  const baseUrl = (c: Pick<CredentialsFor<'ninjaone'>, 'region'>) =>
    (overrides.apiUrl ?? `https://${NINJAONE_REGIONS[c.region].host}`).replace(
      /\/+$/,
      '',
    );

  /** Asks NinjaOne's token endpoint for a token; `refused` explains a no. */
  const requestToken = (
    base: string,
    ctx: SyncContext,
    grant: Record<string, string>,
    refused: ToolError,
  ) =>
    ctx.http.json(`${base}/ws/oauth/token`, token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(grant).toString(),
      what: 'a sign-in token',
      errors: { 400: refused, 401: refused, 404: refused },
    });

  return {
    tool: 'ninjaone',
    access: 'read: organizations, devices, alerts, patch status, tickets',
    createsClients: true,
    home: baseUrl,

    authorizeUrl(app, state, pkce) {
      const url = new URL(`${baseUrl(app)}/ws/oauth/authorize`);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: app.clientId,
        redirect_uri: app.redirectUri,
        scope: SIGN_IN_SCOPE,
        state,
        ...(pkce && {
          code_challenge: pkce.challenge,
          code_challenge_method: 'S256',
        }),
      }).toString();
      return url.toString();
    },

    async finishSignIn(app, code, ctx, pkce) {
      const { refresh_token } = await requestToken(
        baseUrl(app),
        ctx,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: app.redirectUri,
          ...appOf(app),
          ...(pkce && { code_verifier: pkce.verifier }),
        },
        new ToolError(
          'credentials',
          'NinjaOne didn’t accept the sign-in. Check the client ID (and secret, if the app has one), and that the NinjaOne app’s redirect URI is exactly the one Dossier shows, then sign in again.',
        ),
      );
      if (!refresh_token) {
        throw new ToolError(
          'permission',
          'NinjaOne didn’t let Dossier stay signed in. Allow the Refresh token grant type on the Dossier app in NinjaOne, then sign in again.',
        );
      }
      return {
        tool: 'ninjaone',
        region: app.region,
        clientId: app.clientId,
        ...(app.clientSecret && { clientSecret: app.clientSecret }),
        refreshToken: refresh_token,
      };
    },

    async open(credentials, ctx): Promise<ToolSession> {
      const base = baseUrl(credentials);
      const app = appOf(credentials);
      const signedIn = credentials.refreshToken !== undefined;
      const { access_token, refresh_token } = signedIn
        ? await requestToken(
            base,
            ctx,
            {
              grant_type: 'refresh_token',
              refresh_token: credentials.refreshToken!,
              ...app,
            },
            new ToolError(
              'credentials',
              'NinjaOne no longer accepts Dossier’s sign-in. Sign in with NinjaOne again.',
            ),
          )
        : await requestToken(
            base,
            ctx,
            { grant_type: 'client_credentials', scope: 'monitoring', ...app },
            new ToolError(
              'credentials',
              'NinjaOne didn’t accept the client ID and secret. Check them, and that the region matches the address you sign in to NinjaOne at.',
            ),
          );
      const headers = { authorization: `Bearer ${access_token}` };
      const get = <T>(path: string, schema: z.ZodType<T>, what: string) =>
        ctx.http.json(`${base}${path}`, schema, { headers, what });

      /** Pages by the last ID seen, as NinjaOne's list endpoints do. */
      async function all<T extends { id: number }>(
        path: string,
        schema: z.ZodType<T>,
        what: string,
      ): Promise<T[]> {
        const items: T[] = [];
        let after: number | undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
          if (after !== undefined) query.set('after', String(after));
          const batch = await get(`${path}?${query}`, z.array(schema), what);
          items.push(...batch);
          if (batch.length < PAGE_SIZE) break;
          after = batch.at(-1)!.id;
        }
        return items;
      }

      /** Pages by cursor, as the /queries endpoints do. */
      async function query(
        path: string,
        params: Record<string, string>,
        what: string,
      ) {
        const items: z.infer<typeof patch>[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const search = new URLSearchParams({
            ...params,
            pageSize: String(PAGE_SIZE),
          });
          if (cursor) search.set('cursor', cursor);
          const batch = await get(`${path}?${search}`, patchPage, what);
          items.push(...batch.results);
          const next = batch.cursor?.name ?? undefined;
          if (batch.results.length < PAGE_SIZE || !next || next === cursor) {
            break;
          }
          cursor = next;
        }
        return items;
      }

      /**
       * Every ticket on the board that holds them all, and NinjaOne's statuses.
       * Boards are searches NinjaOne runs on a POST; they change nothing.
       */
      async function tickets() {
        const refused = new ToolError(
          'permission',
          'NinjaOne didn’t let Dossier read tickets. Check that the technician who signed in can see tickets in NinjaOne, then sign in with NinjaOne again.',
        );
        const boards = await ctx.http.json(
          `${base}/v2/ticketing/trigger/boards`,
          z.array(board),
          { headers, what: 'ticket boards', errors: { 403: refused } },
        );
        // NinjaOne's own "All tickets" board, or else the fullest one.
        const everything =
          boards.find((b) => b.system && /^all\b/i.test(b.name ?? '')) ??
          boards.toSorted(
            (a, b) => (b.ticketCount ?? 0) - (a.ticketCount ?? 0),
          )[0];
        const statuses = await get(
          '/v2/ticketing/statuses',
          z.array(ticketStatus),
          'ticket statuses',
        );
        const rows: BoardRow[] = [];
        let cursor: number | undefined;
        for (let page = 0; everything && page < MAX_PAGES; page++) {
          const batch = await ctx.http.json(
            `${base}/v2/ticketing/trigger/board/${everything.id}/run`,
            boardPage,
            {
              method: 'POST',
              headers: { ...headers, 'content-type': 'application/json' },
              body: JSON.stringify({
                pageSize: PAGE_SIZE,
                ...(cursor !== undefined && { lastCursorId: cursor }),
              }),
              what: 'tickets',
              errors: { 403: refused },
            },
          );
          rows.push(...batch.data);
          // Page sizes may be capped below ours, so follow the cursor instead.
          const next = batch.metadata?.lastCursorId ?? batch.data.at(-1)?.id;
          if (
            batch.data.length === 0 ||
            next === undefined ||
            next === cursor
          ) {
            break;
          }
          cursor = next;
        }
        ctx.audit('Tickets', rows.length);
        return { rows, statuses };
      }

      // One small read, so a key without access fails while connecting.
      await get(
        '/v2/organizations?pageSize=1',
        z.array(organization),
        'organizations',
      );

      let orgCount = 0;
      /** Board rows name the organization but don't give its ID. */
      const orgIdsByName = new Map<string, string>();

      return {
        account: new URL(base).host,
        ...(refresh_token &&
          refresh_token !== credentials.refreshToken && {
            credentials: { ...credentials, refreshToken: refresh_token },
          }),

        async organizations() {
          const orgs = await all(
            '/v2/organizations',
            organization,
            'organizations',
          );
          ctx.audit('Organizations', orgs.length);
          orgCount = orgs.length;
          for (const org of orgs) {
            orgIdsByName.set(normalizeName(org.name), String(org.id));
          }
          return orgs.map((org) => ({
            externalId: String(org.id),
            name: org.name,
            url: `${base}/#/customerDashboard/${org.id}/overview`,
            domains: [],
            location: null,
          }));
        },

        async read(clients: ClientLookup): Promise<ToolRead> {
          const devices = await all(
            '/v2/devices-detailed',
            device,
            'the device list',
          );
          ctx.audit('Device inventory', devices.length);
          const alerts = await get(
            '/v2/alerts',
            z.array(alert),
            'active alerts',
          );
          ctx.audit('Active alerts', alerts.length);
          const failedInstalls = await query(
            '/v2/queries/os-patch-installs',
            { status: 'FAILED' },
            'failed patch installs',
          );
          const outstanding = await query(
            '/v2/queries/os-patches',
            {},
            'outstanding patches',
          );
          ctx.audit('Patch status', failedInstalls.length + outstanding.length);

          const records = toRecords(ctx, base, clients, orgCount, {
            devices,
            alerts,
            failedInstalls,
            outstanding,
          });
          if (!signedIn) {
            return {
              ...records,
              scope: `${records.scope} · sign in to read tickets`,
            };
          }

          // Devices still sync when NinjaOne won't share tickets; say why instead.
          const read = await tickets().catch((error: unknown) => {
            if (
              error instanceof ToolError &&
              (error.kind === 'permission' || error.kind === 'not-found')
            ) {
              return error;
            }
            throw error;
          });
          const found =
            read instanceof ToolError
              ? ticketsRefused(ctx, base, read)
              : ticketRecords(ctx, base, clients, orgIdsByName, read);
          return {
            ...records,
            sources: [...records.sources, ...found.sources],
            tickets: found.tickets,
            attention: [...records.attention, ...found.attention],
            scope: `${records.scope} · ${found.scope}`,
          };
        },
      };
    },
  };
}

function toRecords(
  ctx: SyncContext,
  base: string,
  clients: ClientLookup,
  orgCount: number,
  data: {
    devices: NinjaDevice[];
    alerts: NinjaAlert[];
    failedInstalls: z.infer<typeof patch>[];
    outstanding: z.infer<typeof patch>[];
  },
): ToolRead {
  const now = ctx.now.getTime();
  const recentFailure = (p: z.infer<typeof patch>) => {
    const at = p.installedAt ?? p.timestamp;
    return at == null || now - Date.parse(fromEpoch(at)) < 30 * DAY_MS;
  };
  const failed = new Map<number, number>();
  for (const p of [
    ...data.failedInstalls.filter(recentFailure),
    ...data.outstanding.filter((p) => p.status?.toUpperCase() === 'FAILED'),
  ]) {
    failed.set(
      p.deviceId,
      Math.max(failed.get(p.deviceId) ?? 0, p.installedAt ?? p.timestamp ?? 0),
    );
  }
  const pending = new Set(
    data.outstanding
      .filter((p) =>
        ['MANUAL', 'APPROVED'].includes(p.status?.toUpperCase() ?? ''),
      )
      .map((p) => p.deviceId),
  );

  const sources: RecordSource[] = [];
  const devices: Device[] = [];
  const attention: AttentionItem[] = [];
  const byNinjaId = new Map<number, { device: Device; raw: NinjaDevice }>();
  const deviceUrl = (id: number) => `${base}/#/deviceDashboard/${id}/overview`;

  for (const raw of data.devices) {
    if (SKIPPED_CLASSES.has(raw.nodeClass ?? '')) continue;
    const clientId = clients.forOrg(String(raw.organizationId));
    if (!clientId) continue;

    const name = deviceName(raw);
    const os = raw.os?.name || label(raw.nodeClass) || 'Unknown';
    const lastSeen = raw.lastContact ?? raw.lastUpdate ?? raw.created;
    const lastSeenAt = lastSeen ? fromEpoch(lastSeen) : ctx.now.toISOString();
    const patchStatus: Device['patchStatus'] = failed.has(raw.id)
      ? 'failed'
      : pending.has(raw.id)
        ? 'pending'
        : 'current';
    const assignedTo = userName(raw.lastLoggedInUser);

    const source: RecordSource = {
      id: ctx.id('device', raw.id),
      kind: 'record',
      clientId,
      tool: 'ninjaone',
      recordId: name,
      recordType: 'Device',
      title: `${name} · ${os}`,
      recordedAt: lastSeenAt,
      url: deviceUrl(raw.id),
      fields: [
        { label: 'Type', value: label(raw.nodeClass) || 'Device' },
        { label: 'OS', value: os },
        { label: 'Status', value: raw.offline ? 'Offline' : 'Online' },
        { label: 'Patching', value: label(patchStatus) },
        ...(assignedTo ? [{ label: 'Last user', value: assignedTo }] : []),
        ...(raw.system?.model
          ? [
              {
                label: 'Model',
                value: [raw.system.manufacturer, raw.system.model]
                  .filter(Boolean)
                  .join(' '),
              },
            ]
          : []),
      ],
    };
    const mapped: Device = {
      id: ctx.id('device-record', raw.id),
      clientId,
      name,
      type: deviceType(raw),
      os,
      assignedTo,
      lastSeenAt,
      patchStatus,
      sourceId: source.id,
    };
    sources.push(source);
    devices.push(mapped);
    byNinjaId.set(raw.id, { device: mapped, raw });
  }

  // Active alerts, on devices we know.
  const offlineAlerted = new Set<number>();
  for (const a of data.alerts) {
    const known = a.deviceId == null ? undefined : byNinjaId.get(a.deviceId);
    if (!known) continue;
    if (a.sourceType === 'AGENT_OFFLINE') offlineAlerted.add(known.raw.id);
    const title = oneLine(
      a.subject || a.message || label(a.sourceType) || 'Alert',
      140,
    );
    const raisedAt = a.createTime
      ? fromEpoch(a.createTime)
      : ctx.now.toISOString();
    const source: RecordSource = {
      id: ctx.id('alert', a.uid),
      kind: 'record',
      clientId: known.device.clientId,
      tool: 'ninjaone',
      recordId: `ALERT-${a.uid.slice(0, 8).toUpperCase()}`,
      recordType: 'Alert',
      title,
      recordedAt: raisedAt,
      url: deviceUrl(known.raw.id),
      fields: [
        { label: 'Device', value: known.device.name },
        ...(a.severity
          ? [{ label: 'Severity', value: label(a.severity) }]
          : []),
        ...(a.priority
          ? [{ label: 'Priority', value: label(a.priority) }]
          : []),
        ...(a.conditionName
          ? [{ label: 'Condition', value: a.conditionName }]
          : []),
        ...(a.message && a.message !== title
          ? [{ label: 'Message', value: oneLine(a.message, 400) }]
          : []),
      ],
    };
    sources.push(source);
    attention.push({
      id: ctx.id('attention-alert', a.uid),
      clientId: known.device.clientId,
      kind: 'alert',
      urgency: urgencyOf(a),
      title,
      raisedAt,
      sourceIds: [source.id, known.device.sourceId],
    });
  }

  // Servers that have gone quiet, unless an alert already says so.
  for (const { device: d, raw } of byNinjaId.values()) {
    if (d.type !== 'server' || !raw.offline || offlineAlerted.has(raw.id))
      continue;
    if (now - Date.parse(d.lastSeenAt) < 30 * 60_000) continue;
    attention.push({
      id: ctx.id('attention-offline', raw.id),
      clientId: d.clientId,
      kind: 'alert',
      urgency: 'high',
      title: `${d.name} is offline`,
      raisedAt: d.lastSeenAt,
      sourceIds: [d.sourceId],
    });
  }

  // Failed patching, once per client.
  const failedByClient = new Map<
    string,
    { devices: Device[]; latest: number }
  >();
  for (const { device: d, raw } of byNinjaId.values()) {
    if (d.patchStatus !== 'failed') continue;
    const entry = failedByClient.get(d.clientId) ?? { devices: [], latest: 0 };
    entry.devices.push(d);
    entry.latest = Math.max(entry.latest, failed.get(raw.id) ?? 0);
    failedByClient.set(d.clientId, entry);
  }
  for (const [clientId, { devices: failing, latest }] of failedByClient) {
    failing.sort((a, b) => a.name.localeCompare(b.name));
    attention.push({
      id: ctx.id('attention-patching', clientId),
      clientId,
      kind: 'risk',
      urgency: 'high',
      title:
        failing.length === 1
          ? `Patches failed to install on ${failing[0]!.name}`
          : `Patches failed to install on ${failing.length} devices`,
      raisedAt: latest ? fromEpoch(latest) : ctx.now.toISOString(),
      sourceIds: failing.slice(0, 10).map((d) => d.sourceId),
    });
  }

  return {
    sources,
    devices,
    tickets: [],
    attention,
    meetings: [],
    commitments: [],
    scope: `RMM · ${orgCount} ${orgCount === 1 ? 'organization' : 'organizations'} · ${devices.length} devices`,
  };
}

type TicketRead = Pick<ToolRead, 'sources' | 'tickets' | 'attention'> & {
  /** Added to the connector's scope, e.g. "4 open tickets". */
  scope: string;
};

/** A board cell as text: a string, or the name on a person or status. */
function cell(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const full = [v.firstName, v.lastName]
      .filter((part) => typeof part === 'string' && part)
      .join(' ');
    return cell(v.displayName) ?? cell(v.name) ?? (full || cell(v.email));
  }
  return null;
}

const epoch = (value: unknown) =>
  typeof value === 'number' && value > 0 ? fromEpoch(value) : null;

/** Whether a row's status means the work is done, custom statuses included. */
function doneCheck(statuses: TicketStatus[]): (status: unknown) => boolean {
  const byId = new Map<number, TicketStatus>();
  for (const s of statuses) if (s.statusId != null) byId.set(s.statusId, s);
  const isDone = (s: TicketStatus | undefined, depth = 0): boolean =>
    s !== undefined &&
    (DONE_STATUSES.has((s.name ?? '').toUpperCase()) ||
      (depth < 5 &&
        s.parentId != null &&
        s.parentId !== s.statusId &&
        isDone(byId.get(s.parentId), depth + 1)));
  const doneNames = new Set(
    statuses
      .filter((s) => isDone(s))
      .flatMap((s) => [s.name, s.displayName])
      .flatMap((name) => (name ? [name.toLowerCase()] : [])),
  );
  return (status) => {
    const parsed = ticketStatus.safeParse(status);
    if (parsed.success) {
      const { statusId } = parsed.data;
      if (isDone(parsed.data)) return true;
      if (statusId != null && isDone(byId.get(statusId))) return true;
    }
    const name = cell(status);
    return (
      name !== null &&
      (doneNames.has(name.toLowerCase()) ||
        DONE_STATUSES.has(name.toUpperCase()))
    );
  };
}

/**
 * Tickets become records, open ones and those closed in the last 90 days.
 * Open tickets of high priority, or major or critical severity, need attention.
 */
function ticketRecords(
  ctx: SyncContext,
  base: string,
  clients: ClientLookup,
  orgIdsByName: ReadonlyMap<string, string>,
  { rows, statuses }: { rows: BoardRow[]; statuses: TicketStatus[] },
): TicketRead {
  const now = ctx.now.getTime();
  const isDone = doneCheck(statuses);
  // Rows usually carry only the organization's name; use an ID when one's there.
  const clientOf = (row: BoardRow) => {
    const org = row.organization;
    const orgId =
      org && typeof org === 'object' ? (org as { id?: unknown }).id : null;
    const id = [row.clientId, row.organizationId, orgId].find(
      (value) => typeof value === 'number',
    );
    if (id !== undefined) return clients.forOrg(String(id));
    const name = cell(org);
    const externalId = name && orgIdsByName.get(normalizeName(name));
    return externalId ? clients.forOrg(externalId) : null;
  };

  const sources: RecordSource[] = [];
  const tickets: Ticket[] = [];
  const attention: AttentionItem[] = [];
  for (const row of rows) {
    const clientId = clientOf(row);
    if (!clientId) continue;
    const open = !isDone(row.status);
    const openedAt = epoch(row.createTime) ?? ctx.now.toISOString();
    const updatedAt =
      epoch(row.lastUpdated) ?? epoch(row.updateTime) ?? openedAt;
    if (!open && now - Date.parse(updatedAt) > CLOSED_TICKET_DAYS * DAY_MS) {
      continue;
    }

    const number = String(row.id);
    const subject = oneLine(
      cell(row.summary) ?? cell(row.subject) ?? `Ticket ${number}`,
      200,
    );
    const status = cell(row.status) ?? (open ? 'Open' : 'Closed');
    const priority = cell(row.priority);
    const severity = cell(row.severity);
    const requester = cell(row.requester);
    const assignedTo = cell(row.assignedAppUser) ?? cell(row.assignee);
    const urgency = urgencyOf({ priority, severity });
    const type = label(cell(row.type));

    const source: RecordSource = {
      id: ctx.id('ticket', row.id),
      kind: 'record',
      clientId,
      tool: 'ninjaone',
      recordId: `#${number}`,
      recordType: 'Ticket',
      title: subject,
      recordedAt: updatedAt,
      url: `${base}/#/ticketing/ticket/${row.id}`,
      fields: [
        { label: 'Status', value: status },
        ...(priority ? [{ label: 'Priority', value: label(priority) }] : []),
        ...(severity ? [{ label: 'Severity', value: label(severity) }] : []),
        ...(type ? [{ label: 'Type', value: type }] : []),
        ...(requester ? [{ label: 'Requester', value: requester }] : []),
        ...(assignedTo ? [{ label: 'Assigned to', value: assignedTo }] : []),
      ],
    };
    sources.push(source);
    tickets.push({
      id: ctx.id('ticket-record', row.id),
      clientId,
      number,
      subject,
      status,
      open,
      urgency,
      requester,
      assignedTo,
      openedAt,
      updatedAt,
      sourceId: source.id,
    });
    if (open && urgency !== 'normal') {
      attention.push({
        id: ctx.id('attention-ticket', row.id),
        clientId,
        kind: 'alert',
        urgency,
        title: `${urgency === 'critical' ? 'Critical' : 'High-priority'} ticket: ${oneLine(subject, 120)}`,
        raisedAt: openedAt,
        sourceIds: [source.id],
      });
    }
  }

  const openCount = tickets.filter((t) => t.open).length;
  return {
    sources,
    tickets,
    attention,
    scope: `${openCount} open ${openCount === 1 ? 'ticket' : 'tickets'}`,
  };
}

/** NinjaOne wouldn't share tickets: one workspace item that says why. */
function ticketsRefused(
  ctx: SyncContext,
  base: string,
  problem: ToolError,
): TicketRead {
  const log: RecordSource = {
    id: ctx.id('ticket-log'),
    kind: 'record',
    clientId: null,
    tool: 'ninjaone',
    recordId: 'TICKETS',
    recordType: 'Sync log',
    title: oneLine(problem.message, 160),
    recordedAt: ctx.now.toISOString(),
    url: `${base}/#/ticketing`,
    fields: [
      { label: 'Problem', value: problem.message },
      ...(problem.detail
        ? [{ label: 'Response', value: oneLine(problem.detail, 300) }]
        : []),
    ],
  };
  return {
    sources: [log],
    tickets: [],
    attention: [
      {
        id: ctx.id('attention-tickets'),
        clientId: null,
        kind: 'connection',
        urgency: 'normal',
        title: 'NinjaOne isn’t sharing tickets with Dossier',
        raisedAt: ctx.now.toISOString(),
        sourceIds: [log.id],
      },
    ],
    scope: 'tickets not shared',
  };
}
