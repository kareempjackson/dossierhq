import {
  attentionItemSchema,
  clientSchema,
  connectorSchema,
  listOf,
  type Connector,
  type Tool,
} from '@dossierhq/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HTTP_OPTIONS } from '../src/integrations/sync.service.js';
import {
  CREDENTIALS,
  NINJAONE_CODE,
  NINJAONE_PUBLIC_APP,
  NINJAONE_SIGN_IN,
  fakeTools,
} from './fake-tools.js';

// A fresh Dossier on the empty in-memory database: sign up, then all four
// tools connected to the fakes in fake-tools.ts, over HTTP.
describe('Sign-up and integrations (e2e)', () => {
  let app: INestApplication;
  let token = '';
  const tools = fakeTools();
  const api = () => request(app.getHttpServer());
  const as = {
    get: (url: string) =>
      api().get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      api().post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) =>
      api().put(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) =>
      api().delete(url).set('Authorization', `Bearer ${token}`),
  };

  /** Waits for a tool's sync to finish, then returns its connector. */
  async function settled(tool: Tool): Promise<Connector> {
    for (let i = 0; i < 100; i++) {
      const { body } = await as.get('/connectors').expect(200);
      const connector = listOf(connectorSchema)
        .parse(body)
        .data.find((c) => c.tool === tool);
      if (connector && connector.status !== 'syncing') return connector;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`${tool} never finished syncing`);
  }

  async function clientNames() {
    const { body } = await as.get('/clients').expect(200);
    return listOf(clientSchema)
      .parse(body)
      .data.map((c) => c.name);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HTTP_OPTIONS)
      .useValue({ fetch: tools.fetch, sleep: async () => {} })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('signs up into a new, empty workspace', async () => {
    await api()
      .post('/auth/sign-up')
      .send({
        workspaceName: 'Larkspur IT',
        timeZone: 'Mars/Olympus',
        name: 'Sam',
        email: 'sam@larkspur.example',
        password: 'short',
      })
      .expect(400);

    const { body } = await api()
      .post('/auth/sign-up')
      .send({
        workspaceName: 'Larkspur IT',
        timeZone: 'Europe/London',
        name: 'Sam Okafor',
        title: 'Service manager',
        email: 'Sam@Larkspur.example',
        password: 'correct horse battery',
      })
      .expect(201);
    token = body.token;
    expect(body.me).toMatchObject({
      user: { name: 'Sam Okafor', email: 'sam@larkspur.example' },
      workspace: { name: 'Larkspur IT', timeZone: 'Europe/London' },
      role: 'owner',
    });

    await api()
      .post('/auth/sign-up')
      .send({
        workspaceName: 'Again',
        timeZone: 'UTC',
        name: 'Eve',
        email: 'sam@larkspur.example',
        password: 'correct horse battery',
      })
      .expect(409);
    await api()
      .post('/auth/sign-in')
      .send({
        email: 'sam@larkspur.example',
        password: 'correct horse battery',
      })
      .expect(200);
    await expect(clientNames()).resolves.toEqual([]);
  });

  it('turns down credentials the tool refuses, in plain words', async () => {
    const { body } = await as
      .put('/connectors/hudu')
      .send({ ...CREDENTIALS.hudu, apiKey: 'wrong' })
      .expect(422);
    expect(body.message).toContain('Hudu turned down the API key');
    await as
      .put('/connectors/hudu')
      .send({ ...CREDENTIALS.fathom })
      .expect(400);
    await as.get('/connectors').expect(200).expect({ data: [] });
  });

  it('connects NinjaOne and creates its clients', async () => {
    const { body } = await as
      .put('/connectors/ninjaone')
      .send(CREDENTIALS.ninjaone)
      .expect(200);
    expect(body).toMatchObject({
      tool: 'ninjaone',
      status: 'syncing',
      account: 'ninja.test',
    });
    expect(body).not.toHaveProperty('credentials');

    const connector = await settled('ninjaone');
    expect(connector).toMatchObject({
      status: 'healthy',
      scope: 'RMM · 3 organizations · 5 devices · sign in to read tickets',
      failure: null,
    });
    await expect(clientNames()).resolves.toEqual([
      'Harbour Dental Ltd',
      'Marlow Freight',
      'Northside Legal',
    ]);
    const attention = listOf(attentionItemSchema).parse(
      (await as.get('/attention').expect(200)).body,
    );
    expect(attention.data[0]).toMatchObject({
      urgency: 'critical',
      title: 'Ransomware behaviour was blocked',
    });
    const devices = await as.get('/devices').expect(200);
    expect(devices.body.data[0]).toMatchObject({
      name: 'HD-RECEPTION',
      patchStatus: 'failed',
    });
  });

  it('signs in to NinjaOne as a technician to read tickets', async () => {
    const { body: start } = await as
      .post('/connectors/ninjaone/sign-in')
      .send(NINJAONE_SIGN_IN)
      .expect(200);
    const authorize = new URL(start.authorizeUrl);
    expect(authorize.pathname).toBe('/ws/oauth/authorize');
    const state = authorize.searchParams.get('state')!;
    expect(start.pending).not.toContain(NINJAONE_SIGN_IN.clientSecret);

    // Back with someone else's state, or no sealed details: start again.
    await as
      .post('/connectors/ninjaone/sign-in/finish')
      .send({ pending: start.pending, state: 'forged', code: NINJAONE_CODE })
      .expect(400);
    await as
      .post('/connectors/ninjaone/sign-in/finish')
      .send({ pending: 'v1.junk', state, code: NINJAONE_CODE })
      .expect(400);

    const { body } = await as
      .post('/connectors/ninjaone/sign-in/finish')
      .send({ pending: start.pending, state, code: NINJAONE_CODE })
      .expect(201);
    expect(body).toMatchObject({ tool: 'ninjaone', status: 'syncing' });
    expect(await settled('ninjaone')).toMatchObject({
      status: 'healthy',
      scope: 'RMM · 3 organizations · 5 devices · 3 open tickets',
    });

    const tickets = await as.get('/tickets').expect(200);
    expect(tickets.body.data.map((t: { number: string }) => t.number)).toEqual([
      '4830',
      '4821',
      '4822',
      '4790',
    ]);
    const attention = await as.get('/attention').expect(200);
    expect(attention.body.data).toContainEqual(
      expect.objectContaining({
        title: 'Critical ticket: Server fan is very loud',
      }),
    );

    // Each sync spends the refresh token; Dossier keeps the new one.
    await as.post('/connectors/ninjaone/sync').expect(202);
    expect(await settled('ninjaone')).toMatchObject({ status: 'healthy' });

    // The code was used up by the first finish.
    const reused = await as
      .post('/connectors/ninjaone/sign-in/finish')
      .send({ pending: start.pending, state, code: NINJAONE_CODE })
      .expect(422);
    expect(reused.body.message).toContain('NinjaOne didn’t accept the sign-in');
  });

  it('signs in an app that has no secret, with PKCE', async () => {
    const app = {
      region: NINJAONE_SIGN_IN.region,
      clientId: NINJAONE_PUBLIC_APP,
      redirectUri: NINJAONE_SIGN_IN.redirectUri,
    };
    const { body: start } = await as
      .post('/connectors/ninjaone/sign-in')
      .send(app)
      .expect(200);
    const authorize = new URL(start.authorizeUrl);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');

    await as
      .post('/connectors/ninjaone/sign-in/finish')
      .send({
        pending: start.pending,
        state: authorize.searchParams.get('state'),
        code: tools.authorize(start.authorizeUrl),
      })
      .expect(201);
    expect(await settled('ninjaone')).toMatchObject({
      status: 'healthy',
      scope: 'RMM · 3 organizations · 5 devices · 3 open tickets',
    });
    // Connecting without signing in still needs a secret.
    const { body } = await as
      .put('/connectors/ninjaone')
      .send({ tool: 'ninjaone', region: 'eu', clientId: NINJAONE_PUBLIC_APP })
      .expect(400);
    expect(JSON.stringify(body)).toContain('Enter the client secret');
  });

  it('joins Hudu companies to the same clients, and adds new ones', async () => {
    await as.put('/connectors/hudu').send(CREDENTIALS.hudu).expect(200);
    await settled('hudu');
    await expect(clientNames()).resolves.toEqual([
      'Cedar Street Clinic',
      'Harbour Dental Ltd',
      'Marlow Freight',
      'Northside Legal',
    ]);
    const { body } = await as.get('/clients').expect(200);
    const harbour = body.data.find(
      (c: { name: string }) => c.name === 'Harbour Dental Ltd',
    );
    expect(harbour).toMatchObject({
      location: 'Portsmouth',
      domains: ['harbourdental.co.uk'],
    });
    const attention = await as
      .get(`/attention?clientId=${harbour.id}`)
      .expect(200);
    expect(attention.body.data.map((a: { kind: string }) => a.kind)).toEqual(
      expect.arrayContaining(['alert', 'risk']),
    );
  });

  it('attaches SharePoint folders and Fathom meetings to those clients', async () => {
    await as
      .put('/connectors/sharepoint')
      .send(CREDENTIALS.sharepoint)
      .expect(200);
    await as.put('/connectors/fathom').send(CREDENTIALS.fathom).expect(200);
    expect(await settled('sharepoint')).toMatchObject({
      status: 'healthy',
      scope: 'Client files · 1 of 2 folders match a client',
    });
    await settled('fathom');

    const { body } = await as.get('/clients').expect(200);
    const harbour = body.data.find(
      (c: { name: string }) => c.name === 'Harbour Dental Ltd',
    );
    const sources = await as.get(`/clients/${harbour.id}/sources`).expect(200);
    const tools = new Set(
      sources.body.data.map((s: { tool: string }) => s.tool),
    );
    expect([...tools].sort()).toEqual([
      'fathom',
      'hudu',
      'ninjaone',
      'sharepoint',
    ]);

    const meetings = await as
      .get(`/meetings?clientId=${harbour.id}`)
      .expect(200);
    expect(meetings.body.data).toHaveLength(1);
    const commitments = await as
      .get(`/commitments?clientId=${harbour.id}`)
      .expect(200);
    expect(commitments.body.data[0].statement).toBe(
      'Send Priya the results of the restore test',
    );

    const audit = await as.get('/audit?tool=sharepoint').expect(200);
    expect(audit.body.data.map((e: { read: string }) => e.read)).toEqual(
      expect.arrayContaining(['Client folders', 'Files in Harbour Dental']),
    );
  });

  it('attaches a meeting no client matched by hand, through later syncs', async () => {
    const clients = await as.get('/clients').expect(200);
    const harbour = clients.body.data.find(
      (c: { name: string }) => c.name === 'Harbour Dental Ltd',
    );
    const meetingIds = async () =>
      (await as.get(`/meetings?clientId=${harbour.id}`).expect(200)).body.data
        .map((m: { id: string }) => m.id)
        .sort();

    const before = await as.get('/meetings/attachments').expect(200);
    expect(before.body).toEqual({
      unattached: [
        expect.objectContaining({ title: 'Call with a gmail address' }),
      ],
      attached: {},
    });
    const id: string = before.body.unattached[0].id;
    const matched = await meetingIds();

    await as
      .put(`/meetings/${id}/client`)
      .send({ clientId: 'no-such-client' })
      .expect(404);
    await as
      .put('/meetings/no-such-meeting/client')
      .send({ clientId: harbour.id })
      .expect(404);
    await as
      .put(`/meetings/${id}/client`)
      .send({ clientId: harbour.id })
      .expect(204);
    await settled('fathom');
    await as
      .get('/meetings/attachments')
      .expect(200)
      .expect({ unattached: [], attached: { [id]: harbour.id } });
    expect(await meetingIds()).toEqual([...matched, id].sort());

    await as.post('/connectors/fathom/sync').expect(202);
    await settled('fathom');
    expect(await meetingIds()).toEqual([...matched, id].sort());

    await as.delete(`/meetings/${id}/client`).expect(204);
    await settled('fathom');
    expect(await meetingIds()).toEqual(matched);
    const after = await as.get('/meetings/attachments').expect(200);
    expect(after.body.unattached.map((m: { id: string }) => m.id)).toEqual([
      id,
    ]);
    await as.delete(`/meetings/${id}/client`).expect(404);
  });

  it('keeps the last good data when a sync fails, and says why', async () => {
    tools.failures['acme.hudu.test'] = 401;
    await as.post('/connectors/hudu/sync').expect(202);
    const failing = await settled('hudu');
    expect(failing).toMatchObject({
      status: 'failing',
      failure: {
        summary: expect.stringContaining('Hudu turned down the API key'),
        fix: 'Update Hudu settings',
      },
    });
    const attention = await as.get('/attention').expect(200);
    expect(attention.body.data).toContainEqual(
      expect.objectContaining({
        kind: 'connection',
        title: 'Hudu has stopped syncing',
        clientId: null,
      }),
    );
    await expect(clientNames()).resolves.toContain('Cedar Street Clinic');

    delete tools.failures['acme.hudu.test'];
    await as.post('/connectors/hudu/sync').expect(202);
    expect(await settled('hudu')).toMatchObject({
      status: 'healthy',
      failure: null,
    });
    const after = await as.get('/attention').expect(200);
    expect(
      after.body.data.some((a: { kind: string }) => a.kind === 'connection'),
    ).toBe(false);
  });

  it('disconnects, forgetting what the tool brought in', async () => {
    await as.delete('/connectors/sharepoint').expect(204);
    await as.delete('/connectors/sharepoint').expect(404);
    await as.delete('/connectors/ninjaone').expect(204);
    // Northside and Marlow came only from NinjaOne; Hudu still has the others.
    await expect(clientNames()).resolves.toEqual([
      'Cedar Street Clinic',
      'Harbour Dental Ltd',
    ]);
    await as.get('/devices').expect(200).expect({ data: [] });
    await as.get('/tickets').expect(200).expect({ data: [] });
    const { body } = await as.get('/connectors').expect(200);
    expect(body.data.map((c: Connector) => c.tool)).toEqual(['hudu', 'fathom']);
    await as.post('/connectors/ninjaone/sync').expect(404);
  });

  it('keeps a second workspace apart from the first', async () => {
    const { body } = await api()
      .post('/auth/sign-up')
      .send({
        workspaceName: 'Kestrel Networks',
        timeZone: 'UTC',
        name: 'Rae Kim',
        email: 'rae@kestrel.example',
        password: 'correct horse battery',
      })
      .expect(201);
    const rae = `Bearer ${body.token}`;
    for (const url of ['/connectors', '/clients', '/devices', '/tickets']) {
      await api()
        .get(url)
        .set('Authorization', rae)
        .expect(200)
        .expect({ data: [] });
    }
    await api()
      .get('/audit')
      .set('Authorization', rae)
      .expect(200)
      .expect({ data: [], newer: null, older: null });
    await api()
      .delete('/connectors/hudu')
      .set('Authorization', rae)
      .expect(404);

    const { body: sams } = await as.get('/connectors').expect(200);
    expect(sams.data.map((c: Connector) => c.tool)).toEqual(['hudu', 'fathom']);
  });
});
