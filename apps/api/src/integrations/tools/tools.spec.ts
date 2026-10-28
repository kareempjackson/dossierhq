import {
  SUMMARY_FIELD,
  type AuditEntry,
  type Client,
  type Tool,
} from '@dossierhq/contracts';
import { createHash } from 'node:crypto';
import {
  CREDENTIALS,
  HOSTS,
  NINJAONE_CODE,
  NINJAONE_PUBLIC_APP,
  NINJAONE_SIGN_IN,
  fakeTools,
} from '../../../test/fake-tools.js';
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
    attached = {} as Record<string, string>,
  }: {
    clients?: Client[];
    tools?: ReturnType<typeof fakeTools>;
    credentials?: object;
    attached?: Record<string, string>;
  } = {},
) {
  const connector = connectors[tool] as unknown as ToolConnector;
  const { ctx, audit } = context(tool, tools.fetch);
  const session = await connector.open(credentials as never, ctx);
  const directory = new ClientDirectory(WS, clients, []);
  const orgs = await session.organizations();
  const adopted = directory.adopt(tool, orgs, connector.createsClients);
  const read = await session.read(directory.lookup(tool, attached));
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
    expect(read.scope).toBe(
      'RMM · 3 organizations · 5 devices · sign in to read tickets',
    );
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

  it('reads no tickets when signed in as the app', async () => {
    const { read, tools } = await sync('ninjaone');
    expect(read.tickets).toEqual([]);
    expect(tools.requests.some((r) => r.includes('/ticketing/'))).toBe(false);
  });

  it('sends technicians to sign in, and keeps a refresh token', async () => {
    const ninja = connectors.ninjaone;
    const url = new URL(ninja.authorizeUrl(NINJAONE_SIGN_IN, 'state-1'));
    expect(`${url.origin}${url.pathname}`).toBe(
      `${HOSTS.ninjaone}/ws/oauth/authorize`,
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'ninja-client',
      redirect_uri: NINJAONE_SIGN_IN.redirectUri,
      scope: 'monitoring offline_access',
      state: 'state-1',
    });

    const tools = fakeTools();
    const { ctx } = context('ninjaone', tools.fetch);
    await expect(
      ninja.finishSignIn(NINJAONE_SIGN_IN, NINJAONE_CODE, ctx),
    ).resolves.toEqual({
      ...CREDENTIALS.ninjaone,
      refreshToken: 'ninja-refresh-1',
    });
    // A code works once.
    await expect(
      ninja.finishSignIn(NINJAONE_SIGN_IN, NINJAONE_CODE, ctx),
    ).rejects.toMatchObject({
      kind: 'credentials',
      message: expect.stringContaining('redirect URI'),
    });
  });

  it('reads open tickets, and closed ones from the last 90 days', async () => {
    const tools = fakeTools();
    const { read, adopted } = await sync('ninjaone', {
      tools,
      credentials: await signedIn(tools),
    });
    const clientOf = (name: string) =>
      adopted.clients.find((c) => c.name === name)!.id;

    const byNumber = Object.fromEntries(read.tickets.map((t) => [t.number, t]));
    // Too old, no organization, and an organization Dossier doesn't know: left out.
    expect(Object.keys(byNumber).sort()).toEqual([
      '4790',
      '4821',
      '4822',
      '4830',
    ]);
    expect(byNumber['4821']).toMatchObject({
      clientId: clientOf('Harbour Dental Ltd'),
      subject: 'Email is down for the whole practice',
      status: 'Open',
      open: true,
      urgency: 'high',
      requester: 'Priya Shah',
      assignedTo: 'Sam Okafor',
    });
    // Matched by name; a custom status that hangs off Waiting is still open.
    expect(byNumber['4822']).toMatchObject({
      clientId: clientOf('Harbour Dental Ltd'),
      status: 'Waiting on client',
      open: true,
      urgency: 'normal',
      requester: 'Priya Shah',
    });
    // A custom status under Resolved is closed.
    expect(byNumber['4790']).toMatchObject({
      clientId: clientOf('Northside Legal'),
      status: 'Fixed by client',
      open: false,
    });
    expect(byNumber['4830']).toMatchObject({
      clientId: clientOf('Marlow Freight'),
      urgency: 'critical',
    });

    const source = read.sources.find(
      (s) => s.id === byNumber['4821']!.sourceId,
    );
    expect(source).toMatchObject({
      recordId: '#4821',
      recordType: 'Ticket',
      url: `${HOSTS.ninjaone}/#/ticketing/ticket/4821`,
    });
    expect(source?.fields).toContainEqual({ label: 'Priority', value: 'High' });

    expect(read.attention.map((a) => [a.urgency, a.title])).toEqual(
      expect.arrayContaining([
        ['high', 'High-priority ticket: Email is down for the whole practice'],
        ['critical', 'Critical ticket: Server fan is very loud'],
      ]),
    );
    expect(read.scope).toBe(
      'RMM · 3 organizations · 5 devices · 3 open tickets',
    );
    // The "All tickets" board, followed page by page.
    const runs = tools.requests.filter((r) => r.endsWith('/run'));
    expect(runs[0]).toBe('POST ninja.test/v2/ticketing/trigger/board/2/run');
    expect(runs.length).toBeGreaterThan(2);
  });

  it('signs in an app with no secret, with PKCE', async () => {
    const ninja = connectors.ninjaone;
    const tools = fakeTools();
    const { ctx } = context('ninjaone', tools.fetch);
    const app = {
      region: NINJAONE_SIGN_IN.region,
      clientId: NINJAONE_PUBLIC_APP,
      redirectUri: NINJAONE_SIGN_IN.redirectUri,
    };
    const verifier = 'v'.repeat(43);
    const pkce = {
      verifier,
      challenge: createHash('sha256').update(verifier).digest('base64url'),
    };
    const url = new URL(ninja.authorizeUrl(app, 'state-1', pkce));
    expect(url.searchParams.get('code_challenge')).toBe(pkce.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    // Without the verifier that made the challenge, the code is no good.
    await expect(
      ninja.finishSignIn(app, tools.authorize(url.toString()), ctx, {
        ...pkce,
        verifier: 'w'.repeat(43),
      }),
    ).rejects.toMatchObject({ kind: 'credentials' });

    const credentials = await ninja.finishSignIn(
      app,
      tools.authorize(url.toString()),
      ctx,
      pkce,
    );
    expect(credentials).toEqual({
      tool: 'ninjaone',
      region: 'eu',
      clientId: NINJAONE_PUBLIC_APP,
      refreshToken: 'ninja-refresh-1',
    });
    // Later syncs refresh without a secret, and read tickets.
    const { read } = await sync('ninjaone', { tools, credentials });
    expect(read.tickets).toHaveLength(4);
  });

  it('keeps the new refresh token NinjaOne hands out', async () => {
    const tools = fakeTools();
    const credentials = await signedIn(tools);
    const { session } = await sync('ninjaone', { tools, credentials });
    expect(session.credentials).toEqual({
      ...credentials,
      refreshToken: 'ninja-refresh-2',
    });
    await expect(
      sync('ninjaone', { tools, credentials }),
    ).rejects.toMatchObject({
      kind: 'credentials',
      message:
        'NinjaOne no longer accepts Dossier’s sign-in. Sign in with NinjaOne again.',
    });
  });

  it('still syncs devices when NinjaOne won’t share tickets', async () => {
    const tools = fakeTools();
    const credentials = await signedIn(tools);
    tools.failures['ninja.test/v2/ticketing/trigger/boards'] = 403;
    const { read } = await sync('ninjaone', { tools, credentials });
    expect(read.devices).toHaveLength(5);
    expect(read.tickets).toEqual([]);
    expect(read.scope).toBe(
      'RMM · 3 organizations · 5 devices · tickets not shared',
    );
    expect(read.attention).toContainEqual(
      expect.objectContaining({
        kind: 'connection',
        clientId: null,
        title: 'NinjaOne isn’t sharing tickets with Dossier',
      }),
    );
  });
});

/** Signs in to the fake NinjaOne as a technician, for its credentials. */
async function signedIn(tools: ReturnType<typeof fakeTools>) {
  const { ctx } = context('ninjaone', tools.fetch);
  return connectors.ninjaone.finishSignIn(NINJAONE_SIGN_IN, NINJAONE_CODE, ctx);
}

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
      'Meeting recordings · 1 client meeting in 90 days · 1 client · 1 meeting matched no client: gmail.com',
    );
  });

  it('keeps Fathom’s summary on the recording', async () => {
    const { read } = await sync('fathom', { clients: [harbourDental] });
    const recording = read.sources.find(
      (s) => s.id === read.meetings[0]!.recordingSourceId,
    );
    const summary = recording?.fields.find((f) => f.label === SUMMARY_FIELD);
    expect(summary?.value).toMatch(/^## Meeting Purpose\n/);
    expect(summary?.value).toContain('**Backups**');
  });

  it('keeps meetings it can’t place, to attach by hand', async () => {
    const before = await sync('fathom', { clients: [harbourDental] });
    expect(before.read.unattached).toEqual([
      expect.objectContaining({
        title: 'Call with a gmail address',
        attendees: ['Someone'],
        domains: ['gmail.com'],
        url: 'https://fathom.video/calls/9002',
      }),
    ]);
    const id = before.read.unattached![0]!.id;

    const after = await sync('fathom', {
      clients: [harbourDental],
      attached: { [id]: harbourDental.id },
    });
    expect(after.read.meetings.map((m) => [m.id, m.clientId])).toContainEqual([
      id,
      harbourDental.id,
    ]);
    expect(after.read.unattached).toEqual([]);

    // Attached to a client that has since gone: back to waiting.
    const gone = await sync('fathom', {
      clients: [harbourDental],
      attached: { [id]: 'removed-client' },
    });
    expect(gone.read.unattached?.map((m) => m.id)).toEqual([id]);
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
