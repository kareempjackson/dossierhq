import {
  clientListItemSchema,
  clientSchema,
  connectorSchema,
  listOf,
  recommendationSchema,
  reportSchema,
  reportSummarySchema,
  sourceSchema,
} from '@dossierhq/contracts';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { DEMO_EMAIL, DEMO_PASSWORD, demo } from '@dossierhq/fixtures';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DATABASE } from '../src/database/database.module.js';

const NOW = '2026-10-09T15:40:00.000Z';

// Boots the real AppModule on the in-memory adapter holding the demo
// workspace (pinned clock; see vitest.config.e2e.ts) and exercises it over HTTP.
describe('API (e2e)', () => {
  let app: INestApplication;
  let token = '';
  const api = () => request(app.getHttpServer());
  /** Requests as the signed-in demo user. */
  const as = {
    get: (url: string) =>
      api().get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      api().post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) =>
      api().patch(url).set('Authorization', `Bearer ${token}`),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE)
      .useValue(createMemoryAdapter(demo))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const signIn = await api()
      .post('/auth/sign-in')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    token = signIn.body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('signs up a new workspace, kept apart from the others', async () => {
    const signUp = {
      workspaceName: 'Kestrel Networks',
      timeZone: 'America/New_York',
      name: 'Rae Kim',
      email: 'rae@kestrel.example',
      password: 'long enough password',
    };
    await api()
      .post('/auth/sign-up')
      .send({ ...signUp, email: DEMO_EMAIL.toUpperCase() })
      .expect(409);
    await api()
      .post('/auth/sign-up')
      .send({ ...signUp, password: 'short' })
      .expect(400);

    const { body } = await api().post('/auth/sign-up').send(signUp).expect(201);
    expect(body.me).toMatchObject({
      user: { name: 'Rae Kim', email: 'rae@kestrel.example', title: '' },
      workspace: { name: 'Kestrel Networks', timeZone: 'America/New_York' },
      role: 'owner',
    });
    const rae = (url: string) =>
      api().get(url).set('Authorization', `Bearer ${body.token}`);
    await rae('/clients').expect(200).expect({ data: [] });
    await rae('/reports').expect(200).expect({ data: [] });
    await rae(`/clients/${demo.clients[0]!.id}`).expect(404);

    // Larkspur IT is untouched, and Rae can sign in again.
    const larkspur = await as.get('/clients').expect(200);
    expect(larkspur.body.data).toHaveLength(demo.clients.length);
    await api()
      .post('/auth/sign-in')
      .send({ email: signUp.email, password: signUp.password })
      .expect(200);
  });

  it('reports health, the workspace and the clock', async () => {
    await api()
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', database: { provider: 'memory', status: 'up' } });
    const workspace = await as.get('/workspace').expect(200);
    expect(workspace.body).toMatchObject({
      id: 'larkspur-it',
      name: 'Larkspur IT',
    });
    await as.get('/clock').expect(200).expect({ now: NOW });
  });

  describe('auth', () => {
    it('requires a session everywhere except health, sign-in and sign-up', async () => {
      await api().get('/clients').expect(401);
      await api()
        .get('/clients')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
      await api().get('/health').expect(200);
    });

    it('says who is signed in', async () => {
      const me = await as.get('/auth/me').expect(200);
      expect(me.body).toMatchObject({
        user: { email: DEMO_EMAIL, name: 'Sam Okafor' },
        workspace: { id: 'larkspur-it', name: 'Larkspur IT' },
        role: 'owner',
      });
      expect(me.body.user).not.toHaveProperty('passwordHash');
    });

    it('rejects wrong passwords and unknown emails the same way', async () => {
      const wrong = await api()
        .post('/auth/sign-in')
        .send({ email: DEMO_EMAIL, password: 'not-it' })
        .expect(401);
      const unknown = await api()
        .post('/auth/sign-in')
        .send({ email: 'nobody@larkspur-it.example', password: 'not-it' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
      await api()
        .post('/auth/sign-in')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(400);
    });

    it('accepts any capitalisation of the email', async () => {
      await api()
        .post('/auth/sign-in')
        .send({
          email: `  ${DEMO_EMAIL.toUpperCase()} `,
          password: DEMO_PASSWORD,
        })
        .expect(200);
    });

    it('locks an email out after repeated failures', async () => {
      const email = 'guesser@larkspur-it.example';
      for (let i = 0; i < 5; i++) {
        await api()
          .post('/auth/sign-in')
          .send({ email, password: `guess-${i}` })
          .expect(401);
      }
      await api()
        .post('/auth/sign-in')
        .send({ email, password: 'guess-5' })
        .expect(429);
    });

    it('ends the session on sign-out', async () => {
      const session = await api()
        .post('/auth/sign-in')
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
      const bearer = `Bearer ${session.body.token}`;
      await api().get('/auth/me').set('Authorization', bearer).expect(200);
      await api()
        .post('/auth/sign-out')
        .set('Authorization', bearer)
        .expect(204);
      await api().get('/auth/me').set('Authorization', bearer).expect(401);
    });
  });

  describe('clients', () => {
    it('lists clients and the overview', async () => {
      const list = listOf(clientSchema).parse(
        (await as.get('/clients').expect(200)).body,
      );
      expect(list.data).toHaveLength(14);
      const overview = listOf(clientListItemSchema).parse(
        (await as.get('/clients/overview').expect(200)).body,
      );
      expect(overview.data[0]).toMatchObject({
        client: { id: 'harbour-dental' },
        attention: { total: 3, critical: 1 },
      });
    });

    it('records views for recent clients', async () => {
      await as.post('/clients/marlow-freight/views').expect(204);
      const recent = await as.get('/clients/recent?limit=2').expect(200);
      expect(recent.body.data.map((c: { id: string }) => c.id)[0]).toBe(
        'marlow-freight',
      );
      expect(recent.body.data).toHaveLength(2);
      await as.post('/clients/no-such-client/views').expect(404);
      await as.get('/clients/recent?limit=0').expect(400);
    });

    it('reads one client and its sources', async () => {
      await as.get('/clients/harbour-dental').expect(200);
      await as.get('/clients/no-such-client').expect(404);
      const sources = listOf(sourceSchema).parse(
        (await as.get('/clients/harbour-dental/sources').expect(200)).body,
      );
      expect(sources.data.length).toBeGreaterThan(20);
      await as.get('/clients/no-such-client/sources').expect(404);
    });

    it('lists meetings and devices for a client', async () => {
      const meetings = await as
        .get('/meetings?clientId=harbour-dental')
        .expect(200);
      expect(meetings.body.data).toHaveLength(2);
      const devices = await as
        .get('/devices?clientId=harbour-dental')
        .expect(200);
      expect(devices.body.data).toHaveLength(24);
      expect(devices.body.data[0].patchStatus).toBe('pending');
    });
  });

  describe('insights', () => {
    it('lists attention items and commitments', async () => {
      const attention = await as
        .get('/attention?clientId=harbour-dental')
        .expect(200);
      expect(attention.body.data).toHaveLength(3);
      expect(attention.body.data[0].urgency).toBe('critical');
      const commitments = await as
        .get('/commitments?clientId=harbour-dental')
        .expect(200);
      expect(commitments.body.data[0].status).toBe('open');
    });

    it('accepts, undoes and edits a recommendation', async () => {
      const drafts = await as.get('/recommendations?status=draft').expect(200);
      expect(drafts.body.data).toHaveLength(5);
      const id = 'rec-csc-extend-disk';

      const accepted = recommendationSchema.parse(
        (
          await as
            .patch(`/recommendations/${id}`)
            .send({ status: 'accepted' })
            .expect(200)
        ).body,
      );
      expect(accepted).toMatchObject({ status: 'accepted', decidedAt: NOW });

      const undone = await as
        .patch(`/recommendations/${id}`)
        .send({ status: 'draft' })
        .expect(200);
      expect(undone.body).toMatchObject({ status: 'draft', decidedAt: null });

      const edited = await as
        .patch(`/recommendations/${id}`)
        .send({ title: '  Extend the disk by 250 GB  ' })
        .expect(200);
      expect(edited.body.title).toBe('Extend the disk by 250 GB');
    });

    it('rejects bad recommendation updates', async () => {
      await as
        .patch('/recommendations/rec-csc-extend-disk')
        .send({})
        .expect(400);
      await as
        .patch('/recommendations/rec-csc-extend-disk')
        .send({ status: 'archived' })
        .expect(400);
      await as
        .patch('/recommendations/no-such-rec')
        .send({ status: 'accepted' })
        .expect(404);
    });
  });

  describe('reports', () => {
    it('lists the review queue, exceptions first', async () => {
      const queue = listOf(reportSummarySchema).parse(
        (await as.get('/reports/queue').expect(200)).body,
      );
      expect(queue.data).toHaveLength(14);
      expect(queue.data.slice(0, 4).every((r) => r.exceptions.length > 0)).toBe(
        true,
      );
      expect(queue.data.slice(4).every((r) => r.exceptions.length === 0)).toBe(
        true,
      );
      const approved = await as.get('/reports?status=approved').expect(200);
      expect(approved.body.data).toHaveLength(42);
    });

    it('reads a whole report', async () => {
      const report = reportSchema.parse(
        (await as.get('/reports/harbour-dental-2026-w41').expect(200)).body,
      );
      expect(report.sections.map((s) => s.kind)[0]).toBe('needs-attention');
      await as.get('/reports/no-such-report').expect(404);
    });

    it('approves one report and puts it back', async () => {
      const id = 'harbour-dental-2026-w41';
      const approved = await as
        .patch(`/reports/${id}`)
        .send({ status: 'approved' })
        .expect(200);
      expect(approved.body).toMatchObject({
        id,
        status: 'approved',
        approvedAt: NOW,
      });
      const back = await as
        .patch(`/reports/${id}`)
        .send({ status: 'draft' })
        .expect(200);
      expect(back.body).toMatchObject({ status: 'draft', approvedAt: null });
      await as
        .patch(`/reports/${id}`)
        .send({ status: 'published' })
        .expect(400);
      await as
        .patch('/reports/no-such-report')
        .send({ status: 'approved' })
        .expect(404);
    });

    it('approves several reports at once', async () => {
      const ids = ['fenwick-rowe-2026-w41', 'copperleaf-studio-2026-w41'];
      const result = await as
        .post('/reports/status')
        .send({ ids, status: 'approved' })
        .expect(200);
      expect(
        result.body.data.map((r: { id: string; status: string }) => [
          r.id,
          r.status,
        ]),
      ).toEqual([
        [ids[0], 'approved'],
        [ids[1], 'approved'],
      ]);
      const queue = await as.get('/reports/queue').expect(200);
      expect(queue.body.data).toHaveLength(12);
      await as
        .post('/reports/status')
        .send({ ids, status: 'draft' })
        .expect(200);
      await as
        .post('/reports/status')
        .send({ ids: [], status: 'approved' })
        .expect(400);
    });
  });

  describe('sources and connections', () => {
    it('reads sources in the order asked', async () => {
      const sources = await as
        .get(
          '/sources?ids=src-hd-call-restore-ask,no-such-source,src-hd-alert-48213',
        )
        .expect(200);
      expect(sources.body.data.map((s: { id: string }) => s.id)).toEqual([
        'src-hd-call-restore-ask',
        'src-hd-alert-48213',
      ]);
      await as.get('/sources').expect(400);
    });

    it('lists connectors and the audit log', async () => {
      const connectors = listOf(connectorSchema).parse(
        (await as.get('/connectors').expect(200)).body,
      );
      expect(connectors.data.find((c) => c.tool === 'hudu')?.status).toBe(
        'failing',
      );
      const audit = await as.get('/audit?tool=hudu').expect(200);
      expect(audit.body.data.length).toBeGreaterThan(0);
      expect(
        audit.body.data.every((e: { tool: string }) => e.tool === 'hudu'),
      ).toBe(true);
      await as.get('/audit?tool=jira').expect(400);
    });
  });
});
