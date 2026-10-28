import {
  auditCountSchema,
  auditPageSchema,
  type AuditEntry,
  clientListItemSchema,
  clientSchema,
  connectorSchema,
  listOf,
  recommendationSchema,
  reportSchema,
  reportSummarySchema,
  sourceSchema,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  TECHNICIAN_EMAIL,
  demo,
} from '@dossierhq/fixtures';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/auth.service.js';
import { DATABASE } from '../src/database/database.module.js';
import { MAILER, type LogMailer } from '../src/mail/mailer.js';

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
    delete: (url: string) =>
      api().delete(url).set('Authorization', `Bearer ${token}`),
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

  describe('password reset', () => {
    const outbox = () => (app.get(MAILER) as LogMailer).outbox;
    /** The token in the newest reset email to `email`, once it arrives. */
    async function resetToken(email: string): Promise<string> {
      for (let i = 0; i < 100; i++) {
        const mail = outbox().findLast((m) => m.to.includes(email));
        const token = mail && /reset-password\?token=([\w-]+)/.exec(mail.text);
        if (token) return token[1]!;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`No reset email reached ${email}`);
    }

    it('emails a link that sets a new password once and ends old sessions', async () => {
      const email = 'lin@heron.example';
      const signUp = await api()
        .post('/auth/sign-up')
        .send({
          workspaceName: 'Heron IT',
          timeZone: 'Europe/London',
          name: 'Lin Park',
          email,
          password: 'the first password',
        })
        .expect(201);
      const oldSession = `Bearer ${signUp.body.token}`;

      const known = await api()
        .post('/auth/password-reset')
        .send({ email: 'LIN@heron.example' })
        .expect(202);
      const unknown = await api()
        .post('/auth/password-reset')
        .send({ email: 'nobody@heron.example' })
        .expect(202);
      expect(known.body).toEqual(unknown.body);

      const token = await resetToken(email);
      const mail = outbox().findLast((m) => m.to.includes(email))!;
      expect(mail.subject).toBe('Reset your Dossier password');
      expect(mail.text).toContain('https://dossier.test/reset-password?token=');
      expect(outbox().some((m) => m.to.includes('nobody@heron.example'))).toBe(
        false,
      );

      await api()
        .post('/auth/password-reset/confirm')
        .send({ token, password: 'short' })
        .expect(400);
      const reset = await api()
        .post('/auth/password-reset/confirm')
        .send({ token, password: 'the second password' })
        .expect(200);
      expect(reset.body.me.user.email).toBe(email);
      await api()
        .get('/auth/me')
        .set('Authorization', `Bearer ${reset.body.token}`)
        .expect(200);
      await api().get('/auth/me').set('Authorization', oldSession).expect(401);

      const again = await api()
        .post('/auth/password-reset/confirm')
        .send({ token, password: 'a third password!' })
        .expect(400);
      expect(again.body.message).toBe(
        'This reset link has expired or was already used. Ask for a new one.',
      );
      await api()
        .post('/auth/sign-in')
        .send({ email, password: 'the first password' })
        .expect(401);
      await api()
        .post('/auth/sign-in')
        .send({ email, password: 'the second password' })
        .expect(200);
    });

    it('refuses an expired link', async () => {
      const db = app.get<DatabaseAdapter>(DATABASE);
      const user = await db.users.findByEmail(DEMO_EMAIL);
      const token = 'an-expired-reset-token';
      await db.passwordResets.create({
        tokenHash: hashToken(token),
        userId: user!.id,
        createdAt: '2020-01-01T00:00:00.000Z',
        expiresAt: '2020-01-01T01:00:00.000Z',
      });
      await api()
        .post('/auth/password-reset/confirm')
        .send({ token, password: 'a new password here' })
        .expect(400);
    });

    it('sends at most three reset emails an hour to one address', async () => {
      const send = () =>
        api()
          .post('/auth/password-reset')
          .send({ email: 'flood@heron.example' });
      for (let i = 0; i < 3; i++) await send().expect(202);
      await send().expect(429);
    });
  });

  describe('roles', () => {
    it('lets technicians do the weekly work but not change the workspace', async () => {
      const session = await api()
        .post('/auth/sign-in')
        .send({ email: TECHNICIAN_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
      expect(session.body.me.role).toBe('technician');
      const bearer = `Bearer ${session.body.token}`;
      const tech = {
        get: (url: string) => api().get(url).set('Authorization', bearer),
        put: (url: string) => api().put(url).set('Authorization', bearer),
        delete: (url: string) => api().delete(url).set('Authorization', bearer),
      };

      await tech.get('/connectors').expect(200);
      await tech.get('/reports/queue').expect(200);

      const connect = await tech
        .put('/connectors/hudu')
        .send({ tool: 'hudu', baseUrl: 'https://x.test', apiKey: 'k' })
        .expect(403);
      expect(connect.body.message).toBe(
        'Only owners and admins can change connections.',
      );
      await tech.delete('/connectors/hudu').expect(403);
      const model = await tech
        .put('/intelligence')
        .send({ model: null })
        .expect(403);
      expect(model.body.message).toBe(
        'Only owners and admins can change how Dossier drafts.',
      );
      // Still there: the 403 came before anything changed.
      const connectors = listOf(connectorSchema).parse(
        (await tech.get('/connectors').expect(200)).body,
      );
      expect(connectors.data.some((c) => c.tool === 'hudu')).toBe(true);
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

    it('lists tickets for a client, open first', async () => {
      const tickets = await as
        .get('/tickets?clientId=harbour-dental')
        .expect(200);
      expect(
        tickets.body.data.map((t: { number: string; open: boolean }) => [
          t.number,
          t.open,
        ]),
      ).toEqual([
        ['4821', true],
        ['4807', true],
        ['4760', false],
        ['4632', false],
      ]);
      await as.get('/tickets?clientId=').expect(400);
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

    it('drafts this week’s reports on demand', async () => {
      const id = 'harbour-dental-2026-w41';
      const one = listOf(reportSummarySchema).parse(
        (
          await as
            .post('/reports')
            .send({ clientId: 'harbour-dental' })
            .expect(201)
        ).body,
      );
      expect(one.data).toEqual([
        expect.objectContaining({ id, status: 'draft', generatedAt: NOW }),
      ]);
      const report = reportSchema.parse(
        (await as.get(`/reports/${id}`).expect(200)).body,
      );
      expect(report.sources.length).toBeGreaterThan(0);

      await as
        .post('/reports')
        .send({ clientId: 'no-such-client' })
        .expect(404);
      await as.post('/reports').send({ clientId: 42 }).expect(400);

      await as.patch(`/reports/${id}`).send({ status: 'approved' }).expect(200);
      const refused = await as
        .post('/reports')
        .send({ clientId: 'harbour-dental' })
        .expect(409);
      expect(refused.body.message).toMatch(/already approved/);

      // No body drafts every client but the approved one.
      const all = await as.post('/reports').expect(201);
      expect(all.body.data).toHaveLength(demo.clients.length - 1);
      await as.patch(`/reports/${id}`).send({ status: 'draft' }).expect(200);
    });
  });

  describe('report questions', () => {
    it('saves questions for every client or one, and edits and removes them', async () => {
      const everyone = await as
        .post('/report-questions')
        .send({ text: '  Is anyone still on Windows 10?  ' })
        .expect(201);
      expect(everyone.body).toMatchObject({
        text: 'Is anyone still on Windows 10?',
        clientId: null,
        createdAt: NOW,
      });
      const harbour = await as
        .post('/report-questions')
        .send({
          text: 'Did the imaging backups run?',
          clientId: 'harbour-dental',
        })
        .expect(201);

      const forHarbour = await as
        .get('/report-questions?clientId=harbour-dental')
        .expect(200);
      // The clock is pinned here, so both were saved at the same moment.
      expect(
        forHarbour.body.data.map((q: { id: string }) => q.id).sort(),
      ).toEqual([everyone.body.id, harbour.body.id].sort());
      const forMarlow = await as
        .get('/report-questions?clientId=marlow-freight')
        .expect(200);
      expect(forMarlow.body.data).toHaveLength(1);

      await as
        .patch(`/report-questions/${harbour.body.id}`)
        .send({ text: 'Did every imaging backup run?' })
        .expect(200)
        .expect((res) =>
          expect(res.body.text).toBe('Did every imaging backup run?'),
        );

      await as.post('/report-questions').send({ text: ' ' }).expect(400);
      await as
        .post('/report-questions')
        .send({ text: 'Why?', clientId: 'no-such-client' })
        .expect(404);
      await as
        .patch(`/report-questions/${harbour.body.id}`)
        .send({})
        .expect(400);
      await as
        .patch('/report-questions/no-such-question')
        .send({ text: 'Why?' })
        .expect(404);

      await as.delete(`/report-questions/${harbour.body.id}`).expect(204);
      await as.delete(`/report-questions/${harbour.body.id}`).expect(404);
      await as.delete(`/report-questions/${everyone.body.id}`).expect(204);
      await as.get('/report-questions').expect(200).expect({ data: [] });
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

    it('pages through the audit log by cursor, and counts it', async () => {
      // Reads only: the demo's are fixed, while sign-ins grow as tests run.
      const reads = demo.auditLog.filter((e) => e.kind === 'read');
      const page = async (query = '') =>
        auditPageSchema.parse(
          (await as.get(`/audit?kind=read&limit=20${query}`).expect(200)).body,
        );
      const newest = await page();
      expect(newest.newer).toBeNull();

      const pages = [newest];
      while (pages.at(-1)!.older) {
        pages.push(await page(`&before=${pages.at(-1)!.older}`));
      }
      const ids = pages.flatMap((p) => p.data.map((e) => e.id));
      expect(pages.map((p) => p.data.length)).toEqual([20, 20, 10]);
      expect(new Set(ids).size).toBe(reads.length);

      // Newer goes back the same way; past the top it shows the newest page.
      const back = await page(`&after=${pages[2]!.newer}`);
      expect(back).toEqual(pages[1]);
      await expect(page(`&after=${pages[1]!.newer}`)).resolves.toEqual(newest);

      await as.get('/audit?before=not-a-cursor').expect(400);
      await as
        .get(`/audit?before=${newest.older}&after=${back.newer}`)
        .expect(400);

      const counts = listOf(auditCountSchema).parse(
        (await as.get('/audit/counts').expect(200)).body,
      );
      expect(
        counts.data
          .filter((c) => c.kind === 'read')
          .reduce((sum, c) => sum + c.count, 0),
      ).toBe(reads.length);
      expect(counts.data.map((c) => [c.kind, c.tool])).toEqual([
        ['read', 'ninjaone'],
        ['read', 'hudu'],
        ['read', 'sharepoint'],
        ['read', 'fathom'],
        ['sign-in', null],
        ['change', null],
      ]);
    });
  });

  describe('audit events', () => {
    /** The newest entries of a kind, once `ready` finds what it waits for. */
    async function newest(
      kind: 'sign-in' | 'change',
      ready: (entries: AuditEntry[]) => boolean = () => true,
    ): Promise<AuditEntry[]> {
      for (let i = 0; i < 100; i++) {
        const { data } = auditPageSchema.parse(
          (await as.get(`/audit?kind=${kind}`).expect(200)).body,
        );
        if (ready(data)) return data;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`The ${kind} entries never arrived`);
    }
    const sam = {
      userId: demo.users[0]!.id,
      name: demo.users[0]!.name,
      email: DEMO_EMAIL,
    };

    it('records sign-ins and failed attempts, without slowing the answer', async () => {
      await api()
        .post('/auth/sign-in')
        .send({ email: DEMO_EMAIL, password: 'not the password' })
        .expect(401);
      const entries = await newest('sign-in', (data) =>
        data.some(
          (e) => e.outcome === 'failed' && e.actor?.email === DEMO_EMAIL,
        ),
      );
      expect(entries.find((e) => e.outcome === 'failed')).toMatchObject({
        kind: 'sign-in',
        what: 'Sign-in failed: wrong password',
        actor: sam,
      });
      expect(entries.some((e) => e.what === 'Signed in')).toBe(true);
    });

    it('records who approved a report, for its client', async () => {
      const [report] = listOf(reportSummarySchema).parse(
        (await as.get('/reports/queue').expect(200)).body,
      ).data;
      await as
        .patch(`/reports/${report!.id}`)
        .send({ status: 'approved' })
        .expect(200);
      const [entry] = await newest('change');
      expect(entry).toMatchObject({
        kind: 'change',
        clientId: report!.clientId,
        outcome: 'ok',
        actor: sam,
      });
      expect(entry!.what).toMatch(
        /^Approved the weekly report for the week of /,
      );
      await as
        .patch(`/reports/${report!.id}`)
        .send({ status: 'draft' })
        .expect(200);
    });

    it('shows technicians reads only', async () => {
      const session = await api()
        .post('/auth/sign-in')
        .send({ email: TECHNICIAN_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
      const bearer = `Bearer ${session.body.token}`;
      const get = (url: string) => api().get(url).set('Authorization', bearer);

      const { data } = auditPageSchema.parse(
        (await get('/audit').expect(200)).body,
      );
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((e) => e.kind === 'read')).toBe(true);
      const refused = await get('/audit?kind=sign-in').expect(403);
      expect(refused.body.message).toBe(
        'Only owners and admins can see sign-ins and changes.',
      );
      const counts = listOf(auditCountSchema).parse(
        (await get('/audit/counts').expect(200)).body,
      );
      expect(counts.data.every((c) => c.kind === 'read')).toBe(true);
    });
  });
});
