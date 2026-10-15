import {
  NINJAONE_REGIONS,
  type AttentionItem,
  type CredentialsFor,
  type Device,
  type RecordSource,
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
import { DAY_MS, fromEpoch, oneLine } from '../ids.js';

const PAGE_SIZE = 200;
const MAX_PAGES = 500;

const token = z.object({ access_token: z.string() });
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

type NinjaDevice = z.infer<typeof device>;
type NinjaAlert = z.infer<typeof alert>;

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

const urgencyOf = (a: NinjaAlert): Urgency => {
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
 * NinjaOne RMM: organizations become clients; devices, patch status and
 * active alerts become records. Attention items: alerts (by severity),
 * offline servers, and failed patching per client.
 */
export function ninjaOneConnector(
  overrides: { apiUrl?: string } = {},
): ToolConnector<'ninjaone'> {
  const baseUrl = (c: CredentialsFor<'ninjaone'>) =>
    (overrides.apiUrl ?? `https://${NINJAONE_REGIONS[c.region].host}`).replace(
      /\/+$/,
      '',
    );

  return {
    tool: 'ninjaone',
    access: 'read: organizations, devices, alerts, patch status',
    createsClients: true,
    home: baseUrl,

    async open(credentials, ctx): Promise<ToolSession> {
      const base = baseUrl(credentials);
      const refused = new ToolError(
        'credentials',
        'NinjaOne didn’t accept the client ID and secret. Check them, and that the region matches the address you sign in to NinjaOne at.',
      );
      const { access_token } = await ctx.http.json(
        `${base}/ws/oauth/token`,
        token,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            scope: 'monitoring',
          }).toString(),
          what: 'a sign-in token',
          errors: { 400: refused, 401: refused, 404: refused },
        },
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

      // One small read, so a key without access fails while connecting.
      await get(
        '/v2/organizations?pageSize=1',
        z.array(organization),
        'organizations',
      );

      let orgCount = 0;

      return {
        account: new URL(base).host,

        async organizations() {
          const orgs = await all(
            '/v2/organizations',
            organization,
            'organizations',
          );
          ctx.audit('Organizations', orgs.length);
          orgCount = orgs.length;
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

          return toRecords(ctx, base, clients, orgCount, {
            devices,
            alerts,
            failedInstalls,
            outstanding,
          });
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
    attention,
    meetings: [],
    commitments: [],
    scope: `RMM · ${orgCount} ${orgCount === 1 ? 'organization' : 'organizations'} · ${devices.length} devices`,
  };
}
