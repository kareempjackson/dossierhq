/**
 * The four tools' APIs, faked: a fetch that answers like NinjaOne, Hudu,
 * Microsoft Graph and Fathom do (shapes from their API docs), over one small
 * made-up MSP. Tests change `world` or `failures` to try other cases.
 */

export const HOSTS = {
  ninjaone: 'https://ninja.test',
  hudu: 'https://acme.hudu.test',
  login: 'https://login.test',
  graph: 'https://graph.test/v1.0',
  fathom: 'https://fathom.test/external/v1',
} as const;

export const CREDENTIALS = {
  ninjaone: {
    tool: 'ninjaone',
    region: 'eu',
    clientId: 'ninja-client',
    clientSecret: 'ninja-secret',
  },
  hudu: { tool: 'hudu', url: HOSTS.hudu, apiKey: 'hudu-key' },
  sharepoint: {
    tool: 'sharepoint',
    tenantId: 'acme.onmicrosoft.com',
    clientId: 'graph-client',
    clientSecret: 'graph-secret',
    siteUrl: 'https://acme.sharepoint.com/sites/Clients',
    library: '',
    folder: 'Clients',
  },
  fathom: { tool: 'fathom', apiKey: 'fathom-key-1234' },
} as const;

const DAY = 86_400_000;
const seconds = (ms: number) => ms / 1000;

export function makeWorld(now = Date.now()) {
  const isoDay = (days: number) =>
    new Date(now + days * DAY).toISOString().slice(0, 10);
  const iso = (ms: number) => new Date(ms).toISOString();

  return {
    ninjaone: {
      organizations: [
        { id: 1, name: 'Harbour Dental Ltd', description: '' },
        { id: 2, name: 'Northside Legal', description: '' },
        { id: 3, name: 'Marlow Freight', description: '' },
      ],
      devices: [
        {
          id: 101,
          organizationId: 1,
          nodeClass: 'WINDOWS_SERVER',
          offline: true,
          systemName: 'HD-SRV01',
          lastContact: seconds(now - 2 * 3_600_000),
          os: { name: 'Windows Server 2022 Standard' },
        },
        {
          id: 102,
          organizationId: 1,
          nodeClass: 'WINDOWS_WORKSTATION',
          offline: false,
          displayName: 'HD-RECEPTION',
          lastContact: seconds(now - 60_000),
          lastLoggedInUser: 'HARBOUR\\priya',
          os: { name: 'Windows 11 Pro' },
        },
        {
          id: 103,
          organizationId: 1,
          nodeClass: 'WINDOWS_WORKSTATION',
          offline: false,
          systemName: 'HD-LAPTOP1',
          lastContact: seconds(now - 120_000),
          os: { name: 'Windows 11 Pro' },
          system: {
            chassisType: 'LAPTOP',
            manufacturer: 'Dell',
            model: 'Latitude 5440',
          },
        },
        {
          id: 201,
          organizationId: 2,
          nodeClass: 'NMS_FIREWALL',
          offline: false,
          displayName: 'NL-FW01',
          lastContact: seconds(now - 300_000),
        },
        {
          id: 202,
          organizationId: 2,
          nodeClass: 'ANDROID',
          displayName: 'NL-PHONE',
          lastContact: seconds(now - 300_000),
        },
        {
          id: 301,
          organizationId: 3,
          nodeClass: 'MAC',
          offline: false,
          displayName: 'MF-MAC1',
          lastContact: seconds(now - 600_000),
          os: { name: 'macOS 15' },
        },
      ],
      alerts: [
        {
          uid: 'a1b2c3d4-0000-4000-8000-000000000001',
          deviceId: 102,
          subject: 'Ransomware behaviour was blocked',
          message: 'Ransomware behaviour was blocked and the device isolated',
          createTime: seconds(now - 3_600_000),
          sourceType: 'CONDITION_AGENT_SECURITY',
          severity: 'CRITICAL',
          priority: 'HIGH',
        },
        {
          uid: 'a1b2c3d4-0000-4000-8000-000000000002',
          deviceId: 999,
          message: 'An alert on a device Dossier doesn’t know',
          createTime: seconds(now - 3_600_000),
          severity: 'MINOR',
        },
      ],
      failedInstalls: [
        {
          id: 'p1',
          deviceId: 102,
          name: '2026-10 Cumulative Update',
          status: 'FAILED',
          installedAt: seconds(now - 2 * DAY),
        },
      ],
      outstanding: [
        { id: 'p2', deviceId: 103, name: 'Feature update', status: 'APPROVED' },
      ],
    },
    hudu: {
      companies: [
        {
          id: 11,
          name: 'Harbour Dental',
          website: 'https://www.harbourdental.co.uk',
          city: 'Portsmouth',
          state: null,
          archived: false,
          url: '/c/harbour-dental',
          full_url: `${HOSTS.hudu}/c/harbour-dental`,
        },
        {
          id: 12,
          name: 'Cedar Street Clinic',
          website: 'cedarstreet.example',
          city: 'Bristol',
          archived: false,
          url: '/c/cedar-street',
          full_url: `${HOSTS.hudu}/c/cedar-street`,
        },
        { id: 13, name: 'Old Client', archived: true, url: '/c/old' },
      ],
      assets: [
        {
          id: 501,
          company_id: 11,
          name: 'HD-SRV01',
          asset_type: 'Server',
          primary_serial: 'SN-123',
          archived: false,
          url: `${HOSTS.hudu}/a/hd-srv01`,
          updated_at: iso(now - 5 * DAY),
          fields: [
            { label: 'Admin password', value: 'hunter2' },
            { label: 'Location', value: 'Comms cupboard' },
            { label: 'Notes', value: null },
          ],
        },
        {
          id: 502,
          company_id: 12,
          name: 'CSC Firewall',
          asset_type: 'Firewall',
          archived: false,
          url: `${HOSTS.hudu}/a/csc-fw`,
          updated_at: iso(now - 9 * DAY),
          fields: [],
        },
      ],
      websites: [
        {
          id: 61,
          company_id: 11,
          name: 'https://harbourdental.co.uk',
          monitoring_status: 'up',
          url: '/websites/harbourdental',
        },
      ],
      expirations: [
        {
          id: 71,
          company_id: 11,
          expirationable_type: 'Website',
          expirationable_id: 61,
          date: isoDay(10),
          expiration_type: 'ssl_certificate',
        },
        {
          id: 72,
          company_id: 12,
          expirationable_type: 'Asset',
          expirationable_id: 502,
          date: isoDay(200),
          expiration_type: 'warranty',
        },
      ],
    },
    graph: {
      site: {
        id: 'acme.sharepoint.com,1111,2222',
        webUrl: CREDENTIALS.sharepoint.siteUrl,
      },
      drives: [
        {
          id: 'drive-docs',
          name: 'Documents',
          webUrl:
            'https://acme.sharepoint.com/sites/Clients/Shared%20Documents',
          driveType: 'documentLibrary',
        },
      ],
      root: {
        id: 'folder-clients',
        name: 'Clients',
        webUrl:
          'https://acme.sharepoint.com/sites/Clients/Shared%20Documents/Clients',
        folder: { childCount: 3 },
      },
      children: {
        'folder-clients': [
          [
            folder('folder-hd', 'Harbour Dental'),
            folder('folder-unknown', 'Unknown Co'),
            file('file-readme', 'Read me.txt', now - DAY),
          ],
        ],
        'folder-hd': [
          [
            file('file-contract', 'Contract 2026.pdf', now - 30 * DAY),
            folder('folder-hd-net', 'Network'),
          ],
          [file('file-onboarding', 'Onboarding.docx', now - 3 * DAY)],
        ],
        'folder-hd-net': [
          [file('file-diagram', 'Diagram.vsdx', now - 7 * DAY)],
        ],
        'folder-unknown': [[file('file-unknown', 'Notes.docx', now - DAY)]],
      } as Record<string, unknown[][]>,
    },
    fathom: {
      pages: [
        {
          items: [
            {
              title: 'Harbour Dental monthly check-in',
              meeting_title: 'Monthly check-in',
              recording_id: 9001,
              url: 'https://fathom.video/calls/9001',
              share_url: 'https://fathom.video/share/abc',
              created_at: iso(now - 20 * DAY + 3_600_000),
              scheduled_start_time: iso(now - 20 * DAY),
              recording_start_time: iso(now - 20 * DAY),
              recording_end_time: iso(now - 20 * DAY + 32 * 60_000),
              calendar_invitees: [
                {
                  name: 'Priya Nair',
                  email: 'priya@harbourdental.co.uk',
                  email_domain: 'harbourdental.co.uk',
                  is_external: true,
                },
                {
                  name: 'Sam Okafor',
                  email: 'sam@larkspur.example',
                  email_domain: 'larkspur.example',
                  is_external: false,
                },
              ],
              recorded_by: {
                name: 'Sam Okafor',
                email: 'sam@larkspur.example',
              },
              action_items: [
                {
                  description: 'Send Priya the results of the restore test',
                  completed: false,
                  recording_timestamp: '00:10:45',
                  recording_playback_url:
                    'https://fathom.video/calls/9001?timestamp=645',
                  assignee: {
                    name: 'Sam Okafor',
                    email: 'sam@larkspur.example',
                  },
                },
                {
                  description: 'Share the new floor plan',
                  completed: false,
                  recording_timestamp: '00:20:00',
                  assignee: {
                    name: 'Priya Nair',
                    email: 'priya@harbourdental.co.uk',
                  },
                },
              ],
            },
          ],
          next_cursor: 'page-2',
        },
        {
          items: [
            {
              title: 'Call with a gmail address',
              recording_id: 9002,
              url: 'https://fathom.video/calls/9002',
              created_at: iso(now - 2 * DAY),
              calendar_invitees: [
                {
                  name: 'Someone',
                  email: 'someone@gmail.com',
                  email_domain: 'gmail.com',
                  is_external: true,
                },
              ],
              action_items: [],
            },
          ],
          next_cursor: null,
        },
      ],
    },
  };
}

function folder(id: string, name: string) {
  return {
    id,
    name,
    webUrl: `https://acme.sharepoint.com/sites/Clients/Shared%20Documents/${encodeURIComponent(name)}`,
    folder: { childCount: 1 },
  };
}

function file(id: string, name: string, modified: number) {
  return {
    id,
    name,
    webUrl: `https://acme.sharepoint.com/sites/Clients/Shared%20Documents/${encodeURIComponent(name)}`,
    lastModifiedDateTime: new Date(modified).toISOString(),
    size: 48_213,
    file: { mimeType: 'application/octet-stream' },
    lastModifiedBy: { user: { displayName: 'Sam Okafor' } },
  };
}

export type World = ReturnType<typeof makeWorld>;

/** A fetch that answers like the four tools. */
export function fakeTools(world: World = makeWorld()) {
  const requests: string[] = [];
  /** Make a host answer with a status, e.g. `{ 'acme.hudu.test': 401 }`. */
  const failures: Record<string, number> = {};

  const json = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.host}${url.pathname}${url.search}`);
    const failure = failures[url.host];
    if (failure) return json({ error: 'failed' }, failure);
    const q = url.searchParams;
    const header = (name: string) => new Headers(init?.headers).get(name);

    switch (url.host) {
      case 'ninja.test': {
        if (url.pathname === '/ws/oauth/token') {
          const body = new URLSearchParams(String(init?.body));
          return body.get('client_secret') === CREDENTIALS.ninjaone.clientSecret
            ? json({
                access_token: 'ninja-token',
                expires_in: 3600,
                token_type: 'Bearer',
              })
            : json({ resultCode: 'Client app not exist' }, 404);
        }
        if (header('authorization') !== 'Bearer ninja-token') {
          return json({ error: 'not_authenticated' }, 401);
        }
        const pageSize = Number(q.get('pageSize') ?? 1000);
        const after = Number(q.get('after') ?? 0);
        const paged = <T extends { id: number }>(items: T[]) =>
          json(items.filter((i) => i.id > after).slice(0, pageSize));
        switch (url.pathname) {
          case '/v2/organizations':
            return paged(world.ninjaone.organizations);
          case '/v2/devices-detailed':
            return paged(world.ninjaone.devices);
          case '/v2/alerts':
            return json(world.ninjaone.alerts);
          case '/v2/queries/os-patch-installs':
            return json({
              cursor: { name: null },
              results: world.ninjaone.failedInstalls,
            });
          case '/v2/queries/os-patches':
            return json({
              cursor: { name: null },
              results: world.ninjaone.outstanding,
            });
        }
        break;
      }
      case 'acme.hudu.test': {
        if (header('x-api-key') !== CREDENTIALS.hudu.apiKey) {
          return json({ error: 'Unauthorized' }, 401);
        }
        const page = Number(q.get('page') ?? 1);
        const size = Number(q.get('page_size') ?? 25);
        const slice = <T>(items: T[]) =>
          items.slice((page - 1) * size, page * size);
        switch (url.pathname) {
          case '/api/v1/companies':
            // Hudu leaves archived companies out of the list.
            return json({
              companies: slice(world.hudu.companies.filter((c) => !c.archived)),
            });
          case '/api/v1/assets':
            return json({ assets: slice(world.hudu.assets) });
          case '/api/v1/websites':
            return json(slice(world.hudu.websites));
          case '/api/v1/expirations':
            return json(slice(world.hudu.expirations));
        }
        break;
      }
      case 'login.test': {
        const body = new URLSearchParams(String(init?.body));
        return body.get('client_secret') === CREDENTIALS.sharepoint.clientSecret
          ? json({
              token_type: 'Bearer',
              expires_in: 3599,
              access_token: 'graph-token',
            })
          : json(
              { error: 'invalid_client', error_description: 'AADSTS7000215' },
              401,
            );
      }
      case 'graph.test': {
        if (header('authorization') !== 'Bearer graph-token') {
          return json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
        }
        const path = decodeURIComponent(url.pathname.replace('/v1.0', ''));
        if (path === '/sites/acme.sharepoint.com:/sites/Clients')
          return json(world.graph.site);
        if (path === `/sites/${world.graph.site.id}/drives`)
          return json({ value: world.graph.drives });
        if (path === '/drives/drive-docs/root:/Clients')
          return json(world.graph.root);
        const children = path.match(
          /^\/drives\/drive-docs\/items\/([^/]+)\/children$/,
        );
        if (children) {
          const pages = world.graph.children[children[1]!] ?? [[]];
          const index = Number(q.get('page') ?? 0);
          const next =
            index + 1 < pages.length
              ? `${HOSTS.graph}/drives/drive-docs/items/${children[1]}/children?page=${index + 1}`
              : undefined;
          return json({
            value: pages[index],
            ...(next && { '@odata.nextLink': next }),
          });
        }
        return json(
          { error: { code: 'itemNotFound', message: 'Not found' } },
          404,
        );
      }
      case 'fathom.test': {
        if (header('x-api-key') !== CREDENTIALS.fathom.apiKey) {
          return json({}, 401);
        }
        if (url.pathname === '/external/v1/meetings') {
          const index = q.get('cursor') === 'page-2' ? 1 : 0;
          return json({ limit: 10, ...world.fathom.pages[index] });
        }
        break;
      }
    }
    return json({ error: `No fake for ${method} ${url}` }, 404);
  };

  return { fetch: fetch as typeof globalThis.fetch, requests, failures, world };
}
