import type {
  AttentionItem,
  CredentialsFor,
  RecordSource,
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
import { DAY_MS, domainOf, formatDay, oneLine } from '../ids.js';

const PAGE_SIZE = 250;
const MAX_PAGES = 400;

const company = z.object({
  id: z.number(),
  name: z.string(),
  website: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  archived: z.boolean().nullish(),
  url: z.string().nullish(),
  full_url: z.string().nullish(),
  slug: z.string().nullish(),
});
const asset = z.object({
  id: z.number(),
  company_id: z.number().nullish(),
  name: z.string().nullish(),
  asset_type: z.string().nullish(),
  primary_serial: z.string().nullish(),
  primary_model: z.string().nullish(),
  primary_manufacturer: z.string().nullish(),
  archived: z.boolean().nullish(),
  url: z.string().nullish(),
  updated_at: z.string().nullish(),
  fields: z
    .array(
      z.object({
        label: z.string().nullish(),
        value: z.unknown(),
      }),
    )
    .nullish(),
});
const website = z.object({
  id: z.number(),
  company_id: z.number().nullish(),
  name: z.string().nullish(),
  monitoring_status: z.string().nullish(),
  archived: z.boolean().nullish(),
  url: z.string().nullish(),
  updated_at: z.string().nullish(),
});
const expiration = z.object({
  id: z.number(),
  company_id: z.number().nullish(),
  expirationable_type: z.string().nullish(),
  expirationable_id: z.number().nullish(),
  date: z.string().nullish(),
  expiration_type: z.string().nullish(),
  updated_at: z.string().nullish(),
});

const EXPIRATION_LABELS: Record<string, string> = {
  domain: 'Domain',
  ssl_certificate: 'SSL certificate',
  warranty: 'Warranty',
  asset_field: 'Renewal',
  article_expiration: 'Article review',
};

/** Labels that suggest a secret; their values are never read into Dossier. */
const SENSITIVE = /pass|secret|key|pin|token|credential|otp|recovery/i;

/**
 * Hudu documentation: companies become clients (with their website's domain
 * and their town); assets and websites become records; expirations become
 * records and, within 30 days, attention items. Never reads passwords.
 */
export function huduConnector(): ToolConnector<'hudu'> {
  return {
    tool: 'hudu',
    access: 'read: companies, assets, websites, expirations',
    createsClients: true,
    home: (c) => c.url,

    async open(credentials, ctx): Promise<ToolSession> {
      const base = credentials.url.replace(/\/+$/, '');
      const headers = { 'x-api-key': credentials.apiKey };
      const absolute = (path: string | null | undefined, fallback: string) =>
        !path ? fallback : path.startsWith('/') ? `${base}${path}` : path;
      const refused = new ToolError(
        'credentials',
        'Hudu turned down the API key. Check it, and that its allowed IP addresses include Dossier’s.',
      );
      const get = <T>(path: string, schema: z.ZodType<T>, what: string) =>
        ctx.http.json(`${base}/api/v1${path}`, schema, {
          headers,
          what,
          errors: { 401: refused },
        });

      /** Hudu pages are 1-based; a short page is the last. */
      async function all<T>(
        path: string,
        pick: (body: unknown) => T[],
        schema: z.ZodType<unknown>,
        what: string,
      ): Promise<T[]> {
        const items: T[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
          const sep = path.includes('?') ? '&' : '?';
          const body = await get(
            `${path}${sep}page=${page}&page_size=${PAGE_SIZE}`,
            schema,
            what,
          );
          const batch = pick(body);
          items.push(...batch);
          if (batch.length < PAGE_SIZE) break;
        }
        return items;
      }

      // One small read, so a bad key fails while connecting.
      await get(
        '/companies?page=1&page_size=1',
        z.object({ companies: z.array(company) }),
        'companies',
      );

      let companyCount = 0;

      return {
        account: new URL(base).host,

        async organizations() {
          const companies = await all(
            '/companies',
            (body) =>
              (body as { companies: z.infer<typeof company>[] }).companies,
            z.object({ companies: z.array(company) }),
            'companies',
          );
          ctx.audit('Companies', companies.length);
          const active = companies.filter((c) => !c.archived);
          companyCount = active.length;
          return active.map((c) => ({
            externalId: String(c.id),
            name: c.name,
            url: absolute(c.full_url ?? c.url, `${base}/c/${c.slug ?? c.id}`),
            domains: [domainOf(c.website)].filter((d) => d !== null),
            location:
              [c.city, c.state].filter((part) => part?.trim()).join(', ') ||
              null,
          }));
        },

        async read(clients: ClientLookup): Promise<ToolRead> {
          const assets = await all(
            '/assets?archived=false',
            (body) => (body as { assets: z.infer<typeof asset>[] }).assets,
            z.object({ assets: z.array(asset) }),
            'assets',
          );
          ctx.audit('Assets', assets.length);
          const websites = await all(
            '/websites',
            (body) => body as z.infer<typeof website>[],
            z.array(website),
            'websites',
          );
          ctx.audit('Websites', websites.length);
          const expirations = await all(
            '/expirations',
            (body) => body as z.infer<typeof expiration>[],
            z.array(expiration),
            'expirations',
          );
          ctx.audit('Expirations', expirations.length);
          return toRecords(ctx, base, absolute, clients, companyCount, {
            assets,
            websites,
            expirations,
          });
        },
      };
    },
  };
}

function toRecords(
  ctx: SyncContext,
  base: string,
  absolute: (path: string | null | undefined, fallback: string) => string,
  clients: ClientLookup,
  companyCount: number,
  data: {
    assets: z.infer<typeof asset>[];
    websites: z.infer<typeof website>[];
    expirations: z.infer<typeof expiration>[];
  },
): ToolRead {
  const sources: RecordSource[] = [];
  const attention: AttentionItem[] = [];
  const clientOf = (companyId: number | null | undefined) =>
    companyId == null ? null : clients.forOrg(String(companyId));
  const named = new Map<string, { name: string; url: string }>();
  const now = ctx.now.toISOString();
  let assetCount = 0;

  for (const a of data.assets) {
    const clientId = clientOf(a.company_id);
    if (!clientId || a.archived) continue;
    assetCount++;
    const name = a.name?.trim() || `Asset ${a.id}`;
    const url = absolute(a.url, `${base}/a/${a.id}`);
    named.set(`Asset:${a.id}`, { name, url });

    const custom = (a.fields ?? [])
      .filter(
        (f): f is { label: string; value: string } =>
          !!f.label &&
          typeof f.value === 'string' &&
          f.value.trim() !== '' &&
          f.value.length <= 160 &&
          !f.value.trim().startsWith('{') &&
          !SENSITIVE.test(f.label),
      )
      .slice(0, 6)
      .map((f) => ({ label: f.label, value: oneLine(f.value, 160) }));

    sources.push({
      id: ctx.id('asset', a.id),
      kind: 'record',
      clientId,
      tool: 'hudu',
      recordId: `ASSET-${a.id}`,
      recordType: a.asset_type?.trim() || 'Asset',
      title: name,
      recordedAt: isoOr(a.updated_at, now),
      url,
      fields: [
        ...(a.asset_type ? [{ label: 'Layout', value: a.asset_type }] : []),
        ...(a.primary_manufacturer
          ? [{ label: 'Manufacturer', value: a.primary_manufacturer }]
          : []),
        ...(a.primary_model
          ? [{ label: 'Model', value: a.primary_model }]
          : []),
        ...(a.primary_serial
          ? [{ label: 'Serial', value: a.primary_serial }]
          : []),
        ...custom,
      ],
    });
  }

  for (const w of data.websites) {
    const name = w.name?.trim() || `Website ${w.id}`;
    const url = absolute(w.url, `${base}/websites/${w.id}`);
    named.set(`Website:${w.id}`, { name: domainOf(name) ?? name, url });
    const clientId = clientOf(w.company_id);
    if (!clientId || w.archived) continue;
    sources.push({
      id: ctx.id('website', w.id),
      kind: 'record',
      clientId,
      tool: 'hudu',
      recordId: `WEB-${w.id}`,
      recordType: 'Website',
      title: name,
      recordedAt: isoOr(w.updated_at, now),
      url,
      fields: w.monitoring_status
        ? [{ label: 'Monitoring', value: w.monitoring_status }]
        : [],
    });
  }

  const day = ctx.now.getTime();
  for (const e of data.expirations) {
    const clientId = clientOf(e.company_id);
    if (!clientId || !e.date) continue;
    const due = Date.parse(`${e.date.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(due)) continue;

    const what = EXPIRATION_LABELS[e.expiration_type ?? ''] ?? 'Expiry';
    const target = named.get(`${e.expirationable_type}:${e.expirationable_id}`);
    const subject = target?.name ?? clients.name(clientId);
    const expired = due < day;
    const title = `${what} for ${subject} ${expired ? 'expired' : 'expires'} on ${formatDay(e.date, ctx.now)}`;
    const source: RecordSource = {
      id: ctx.id('expiration', e.id),
      kind: 'record',
      clientId,
      tool: 'hudu',
      recordId: `EXP-${e.id}`,
      recordType: 'Expiration',
      title,
      recordedAt: isoOr(e.updated_at, now),
      url: target?.url ?? `${base}/expirations`,
      fields: [
        { label: 'Type', value: what },
        { label: 'Date', value: e.date.slice(0, 10) },
        ...(target ? [{ label: 'For', value: target.name }] : []),
      ],
    };
    sources.push(source);

    // Expired in the last 30 days, or expiring in the next 30.
    const days = (due - day) / DAY_MS;
    if (days > 30 || days < -30) continue;
    attention.push({
      id: ctx.id('attention-expiration', e.id),
      clientId,
      kind: 'risk',
      urgency: days <= 14 ? 'high' : 'normal',
      title,
      raisedAt: new Date(Math.min(day, due - 30 * DAY_MS)).toISOString(),
      sourceIds: [source.id],
    });
  }

  return {
    sources,
    attention,
    devices: [],
    meetings: [],
    commitments: [],
    scope: `Documentation · ${companyCount} ${companyCount === 1 ? 'company' : 'companies'} · ${assetCount} assets`,
  };
}

function isoOr(value: string | null | undefined, fallback: string): string {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}
