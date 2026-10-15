import type { AuditEntry, Client, Tool } from '@dossierhq/contracts';
import { CREDENTIALS, HOSTS, fakeTools } from '../../../test/fake-tools.js';
import type { SyncContext, ToolConnector } from '../connector.js';
import { ClientDirectory } from '../directory.js';
import { ToolError, ToolHttp } from '../http.js';
import { stableHash } from '../ids.js';
import { fathomConnector } from './fathom.js';
import { huduConnector } from './hudu.js';
import { ninjaOneConnector } from './ninjaone.js';
import { sharePointConnector } from './sharepoint.js';

const WS = 'ws-test';

const connectors = {
  ninjaone: ninjaOneConnector({ apiUrl: HOSTS.ninjaone }),
  hudu: huduConnector(),
  sharepoint: sharePointConnector({
    loginUrl: HOSTS.login,
    graphUrl: HOSTS.graph,
  }),
  fathom: fathomConnector({ apiUrl: HOSTS.fathom }),
} as const;

function context(tool: Tool, fetch: typeof globalThis.fetch) {
  const audit: Omit<AuditEntry, 'id' | 'at' | 'tool'>[] = [];
  const ctx: SyncContext = {
    workspaceId: WS,
    now: new Date(),
    http: new ToolHttp(tool, { fetch, sleep: async () => {} }),
    id: (kind, ...parts) => `${tool}-${kind}-${stableHash(WS, ...parts)}`,
    audit: (read, recordCount, clientId = null) =>
      audit.push({ read, recordCount, clientId }),
  };
  return { ctx, audit };
}

/** Runs one tool's sync steps against the fakes, as SyncService does. */
async function sync<T extends Tool>(
  tool: T,
  {
    clients = [] as Client[],
    tools = fakeTools(),
    credentials = CREDENTIALS[tool] as object,
  }: {
    clients?: Client[];
    tools?: ReturnType<typeof fakeTools>;
    credentials?: object;
  } = {},
) {
  const connector = connectors[tool] as unknown as ToolConnector;
  const { ctx, audit } = context(tool, tools.fetch);
  const session = await connector.open(credentials as never, ctx);
  const directory = new ClientDirectory(WS, clients, []);
  const orgs = await session.organizations();
  const adopted = directory.adopt(tool, orgs, connector.createsClients);
  const read = await session.read(directory.lookup(tool));
  return { session, adopted, read, audit, tools };
}

describe('NinjaOne', () => {
  it('turns organizations into clients, and devices into records', async () => {
    const { adopted, read, session } = await sync('ninjaone');
    expect(session.account).toBe('ninja.test');
    expect(adopted.clients.map((c) => c.name)).toEqual([
      'Harbour Dental Ltd',
      'Northside Legal',
      'Marlow Freight',
    ]);
    expect(adopted.links[0]).toMatchObject({
      tool: 'ninjaone',
      externalId: '1',
      url: `${HOSTS.ninjaone}/#/customerDashboard/1/overview`,
    });

    const byName = Object.fromEntries(read.devices.map((d) => [d.name, d]));
    // The phone is left out.
    expect(Object.keys(byName).sort()).toEqual([
      'HD-LAPTOP1',
      'HD-RECEPTION',
      'HD-SRV01',
      'MF-MAC1',
      'NL-FW01',
    ]);
    expect(byName['HD-SRV01']).toMatchObject({
      type: 'server',
      patchStatus: 'current',
    });
    expect(byName['HD-RECEPTION']).toMatchObject({
      type: 'workstation',
      patchStatus: 'failed',
      assignedTo: 'priya',
      os: 'Windows 11 Pro',
    });
    expect(byName['HD-LAPTOP1']).toMatchObject({
      type: 'laptop',
      patchStatus: 'pending',
    });
    expect(byName['NL-FW01']).toMatchObject({ type: 'network' });
    expect(read.scope).toBe('RMM · 3 organizations · 5 devices');
  });

  it('raises alerts, offline servers and failed patching', async () => {
    const { read } = await sync('ninjaone');
    const titles = read.attention.map((a) => [a.kind, a.urgency, a.title]);
    expect(titles).toEqual(
      expect.arrayContaining([
        ['alert', 'critical', 'Ransomware behaviour was blocked'],
        ['alert', 'high', 'HD-SRV01 is offline'],
        ['risk', 'high', 'Patches failed to install on HD-RECEPTION'],
      ]),
    );
    // The alert on an unknown device is skipped.
    expect(read.attention).toHaveLength(3);
    const alert = read.sources.find((s) => s.recordType === 'Alert');
    expect(alert).toMatchObject({
      recordId: 'ALERT-A1B2C3D4',
      url: `${HOSTS.ninjaone}/#/deviceDashboard/102/overview`,
    });
  });

  it('explains refused credentials', async () => {
    await expect(
      sync('ninjaone', {
        credentials: { ...CREDENTIALS.ninjaone, clientSecret: 'wrong' },
      }),
    ).rejects.toMatchObject({
      kind: 'credentials',
      message: expect.stringContaining('client ID and secret'),
    });
  });
});

describe('Hudu', () => {
  it('turns companies into clients with their town and domain', async () => {
    const { adopted, read, audit } = await sync('hudu');
    expect(adopted.clients.map((c) => [c.name, c.location, c.domains])).toEqual(
      [
        ['Harbour Dental', 'Portsmouth', ['harbourdental.co.uk']],
        ['Cedar Street Clinic', 'Bristol', ['cedarstreet.example']],
      ],
    );
    expect(adopted.links[0]?.url).toBe(`${HOSTS.hudu}/c/harbour-dental`);
    expect(audit.map((a) => a.read)).toEqual([
      'Companies',
      'Assets',
      'Websites',
      'Expirations',
    ]);
    expect(read.scope).toBe('Documentation · 2 companies · 2 assets');
  });

  it('never reads password-like fields', async () => {
    const { read } = await sync('hudu');
    const server = read.sources.find((s) => s.title === 'HD-SRV01');
    expect(server?.fields).toEqual([
      { label: 'Layout', value: 'Server' },
      { label: 'Serial', value: 'SN-123' },
      { label: 'Location', value: 'Comms cupboard' },
    ]);
    expect(JSON.stringify(read)).not.toContain('hunter2');
  });

  it('flags what expires in the next 30 days', async () => {
    const { read } = await sync('hudu');
    expect(read.attention).toEqual([
      expect.objectContaining({
        kind: 'risk',
        urgency: 'high',
        title: expect.stringMatching(
          /^SSL certificate for harbourdental\.co\.uk expires on \d+ \w+/,
        ),
      }),
    ]);
    // The warranty 200 days out is a record, not an attention item.
    expect(
      read.sources.some((s) => s.title.startsWith('Warranty for CSC Firewall')),
    ).toBe(true);
  });

  it('explains a refused key', async () => {
    await expect(
      sync('hudu', { credentials: { ...CREDENTIALS.hudu, apiKey: 'wrong' } }),
    ).rejects.toMatchObject({
      kind: 'credentials',
      message: expect.stringContaining('Hudu turned down the API key'),
    });
  });
});

const harbourDental: Client = {
  id: 'harbour-dental-1',
  name: 'Harbour Dental Ltd',
  industry: null,
  location: null,
  seats: null,
  primaryContact: null,
  contract: null,
  domains: [],
};

describe('SharePoint', () => {
  it('attaches folders that match a client, and reads their files', async () => {
    const { adopted, read, session, audit } = await sync('sharepoint', {
      clients: [harbourDental],
    });
    expect(session.account).toBe(
      'acme.sharepoint.com/sites/Clients / Documents / Clients',
    );
    expect(adopted.clients).toEqual([]);
    expect(adopted.links).toEqual([
      expect.objectContaining({
        externalId: 'folder-hd',
        clientId: harbourDental.id,
      }),
    ]);
    // Newest first, from both pages and the subfolder; nothing from Unknown Co.
    expect(read.sources.map((s) => [s.title, s.fields[0]?.value])).toEqual([
      ['Onboarding.docx', 'Harbour Dental'],
      ['Diagram.vsdx', 'Harbour Dental/Network'],
      ['Contract 2026.pdf', 'Harbour Dental'],
    ]);
    expect(read.scope).toBe('Client files · 1 of 2 folders match a client');
    expect(audit).toContainEqual({
      read: 'Files in Harbour Dental',
      recordCount: 3,
      clientId: harbourDental.id,
    });
  });

  it('explains a missing permission', async () => {
    const tools = fakeTools();
    tools.failures['graph.test'] = 403;
    await expect(sync('sharepoint', { tools })).rejects.toMatchObject({
      kind: 'permission',
      message: expect.stringContaining('Sites.Read.All'),
    });
  });
});

describe('Fathom', () => {
  it('matches meetings by domain and keeps the MSP’s action items', async () => {
    const { read, session } = await sync('fathom', {
      clients: [harbourDental],
    });
    expect(session.account).toBe('API key ending 1234');
    expect(read.meetings).toEqual([
      expect.objectContaining({
        clientId: harbourDental.id,
        title: 'Monthly check-in',
        durationMinutes: 32,
        attendees: [
          { name: 'Priya Nair', role: 'client' },
          { name: 'Sam Okafor', role: 'msp' },
        ],
      }),
    ]);
    // Priya's own action item isn't the MSP's commitment.
    expect(read.commitments).toEqual([
      expect.objectContaining({
        statement: 'Send Priya the results of the restore test',
        status: 'open',
      }),
    ]);
    const cited = read.sources.find(
      (s) => s.id === read.commitments[0]!.sourceIds[0],
    );
    expect(cited).toMatchObject({
      recordType: 'Action item',
      url: 'https://fathom.video/calls/9001?timestamp=645',
    });
    // Twenty days old and still open.
    expect(read.attention).toEqual([
      expect.objectContaining({ kind: 'commitment', urgency: 'normal' }),
    ]);
    expect(read.scope).toBe(
      'Meeting recordings · 1 client meeting in 90 days · 1 client',
    );
  });

  it('waits out rate limiting', async () => {
    const tools = fakeTools();
    const fetch = tools.fetch;
    let calls = 0;
    const flaky: typeof globalThis.fetch = async (input, init) =>
      ++calls === 1
        ? new Response('{}', { status: 429, headers: { 'retry-after': '1' } })
        : fetch(input, init);
    const { ctx } = context('fathom', flaky);
    const session = await connectors.fathom.open(CREDENTIALS.fathom, ctx);
    expect(session.account).toBe('API key ending 1234');
    expect(calls).toBe(2);
  });
});

describe('ToolHttp', () => {
  it('gives up on a tool it can’t reach, in plain words', async () => {
    const http = new ToolHttp('Hudu', {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
      sleep: async () => {},
    });
    const error = await http
      .request('https://nowhere.test', { what: 'companies' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ToolError);
    expect(error).toMatchObject({
      kind: 'unreachable',
      message: 'Dossier couldn’t reach Hudu.',
    });
  });
});
