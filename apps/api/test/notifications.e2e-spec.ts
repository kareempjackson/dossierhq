import {
  connectorSchema,
  listOf,
  memberSchema,
  notificationCountSchema,
  notificationPageSchema,
  notificationSettingsSchema,
  type Connector,
  type EventType,
  type Notification,
  type Tool,
} from '@dossierhq/contracts';
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
import { DATABASE } from '../src/database/database.module.js';
import { EventBus } from '../src/events/event-bus.js';
import { EventDispatcher } from '../src/events/event-dispatcher.js';
import { HTTP_OPTIONS } from '../src/integrations/sync.service.js';
import { MAILER, MailError, type LogMailer } from '../src/mail/mailer.js';
import { ReportScheduler } from '../src/reports/report-scheduler.js';
import { CREDENTIALS, fakeTools } from './fake-tools.js';

const NOW = '2026-10-09T15:40:00.000Z';
const later = (minutes: number) =>
  new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

// The demo workspace: Sam is its owner, Priya a technician. Events are
// handed on only when a test calls handOn(), as EVENTS_POLL_SECONDS is 0.
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  const tokens = { sam: '', priya: '' };
  const tools = fakeTools();
  const api = () => request(app.getHttpServer());
  const as = (who: keyof typeof tokens) => {
    const auth = { Authorization: `Bearer ${tokens[who]}` };
    return {
      get: (url: string) => api().get(url).set(auth),
      post: (url: string) => api().post(url).set(auth),
      put: (url: string) => api().put(url).set(auth),
      patch: (url: string) => api().patch(url).set(auth),
      delete: (url: string) => api().delete(url).set(auth),
    };
  };
  const handOn = (now?: string) => app.get(EventDispatcher).tick(now);
  const emailsTo = (email: string) =>
    (app.get(MAILER) as LogMailer).outbox.filter(
      (mail) => mail.tag === 'notification' && mail.to.includes(email),
    );

  async function feed(who: keyof typeof tokens, query = '') {
    const { body } = await as(who).get(`/notifications${query}`).expect(200);
    return notificationPageSchema.parse(body);
  }
  async function ofType(who: keyof typeof tokens, type: EventType) {
    return (await feed(who, '?limit=100')).data.filter((n) => n.type === type);
  }
  async function unread(who: keyof typeof tokens) {
    const { body } = await as(who).get('/notifications/count').expect(200);
    return notificationCountSchema.parse(body).unread;
  }

  /** Waits for a tool's sync to finish, then returns its connector. */
  async function settled(tool: Tool): Promise<Connector> {
    for (let i = 0; i < 100; i++) {
      const { body } = await as('sam').get('/connectors').expect(200);
      const connector = listOf(connectorSchema)
        .parse(body)
        .data.find((c) => c.tool === tool);
      if (connector && connector.status !== 'syncing') return connector;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`${tool} never finished syncing`);
  }
  async function syncHudu(expected: Connector['status']) {
    await as('sam').post('/connectors/hudu/sync').expect(202);
    expect((await settled('hudu')).status).toBe(expected);
    await handOn();
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(createMemoryAdapter(demo))
      .overrideProvider(HTTP_OPTIONS)
      .useValue({ fetch: tools.fetch, sleep: async () => {} })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    for (const [who, email] of [
      ['sam', DEMO_EMAIL],
      ['priya', TECHNICIAN_EMAIL],
    ] as const) {
      const { body } = await api()
        .post('/auth/sign-in')
        .send({ email, password: DEMO_PASSWORD })
        .expect(200);
      tokens[who] = body.token;
    }
    // Only Hudu stays: the demo's other tools have no credentials to sync.
    for (const tool of ['ninjaone', 'sharepoint', 'fathom']) {
      await as('sam').delete(`/connectors/${tool}`).expect(204);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts with nothing, and only for those signed in', async () => {
    await api().get('/notifications').expect(401);
    await expect(feed('sam')).resolves.toEqual({ data: [], older: null });
    await expect(unread('priya')).resolves.toBe(0);
  });

  it('tells admins when a connection syncs again, and once when it stops', async () => {
    // The demo's Hudu has been failing; reconnected, it syncs again.
    await as('sam').put('/connectors/hudu').send(CREDENTIALS.hudu).expect(200);
    expect((await settled('hudu')).status).toBe('healthy');
    await handOn();
    const [recovered] = await ofType('sam', 'connection.recovered');
    expect(recovered).toMatchObject({
      category: 'connections',
      title: 'Hudu is syncing again',
      body: 'It had stopped since 8 Oct, 23:29.',
      link: '/connections',
      at: NOW,
      readAt: null,
    } satisfies Partial<Notification>);
    // Technicians can't fix connections, and recoveries aren't emailed.
    await expect(feed('priya')).resolves.toMatchObject({ data: [] });
    expect(emailsTo(DEMO_EMAIL)).toEqual([]);

    tools.failures['acme.hudu.test'] = 401;
    await syncHudu('failing');
    const [failing] = await ofType('sam', 'connection.failing');
    expect(failing).toMatchObject({
      title: 'Hudu has stopped syncing',
      link: '/connections',
    });
    expect(failing!.body).toContain('Update its settings on Connections');
    const [mail] = emailsTo(DEMO_EMAIL);
    expect(mail).toMatchObject({
      subject: 'Hudu has stopped syncing',
      to: [DEMO_EMAIL],
    });
    expect(mail!.text).toContain(
      'Open in Dossier: https://dossier.test/connections',
    );
    expect(mail!.text).toContain('https://dossier.test/settings#notifications');
    expect(mail!.html).toContain('Hudu has stopped syncing');

    // Still failing: nothing new.
    await syncHudu('failing');
    await expect(ofType('sam', 'connection.failing')).resolves.toHaveLength(1);
    expect(emailsTo(DEMO_EMAIL)).toHaveLength(1);
    await expect(feed('priya')).resolves.toMatchObject({ data: [] });
    delete tools.failures['acme.hudu.test'];
  });

  it('follows each person’s choices, and keeps their sign-in emails on', async () => {
    const choices = async (who: keyof typeof tokens) =>
      notificationSettingsSchema.parse(
        (await as(who).get('/notifications/preferences').expect(200)).body,
      ).data;
    const priyas = await choices('priya');
    expect(priyas.map((s) => s.type)).not.toContain('connection.failing');
    expect(
      priyas.find((s) => s.type === 'report.delivery-failed'),
    ).toMatchObject({ inApp: true, email: true, locked: [] });
    expect(
      priyas.find((s) => s.type === 'security.password-reset'),
    ).toMatchObject({ inApp: true, email: true, locked: ['email'] });

    const { body } = await as('sam')
      .put('/notifications/preferences')
      .send({
        'connection.failing': { email: false },
        'security.password-reset': { inApp: false, email: false },
      })
      .expect(200);
    const sams = notificationSettingsSchema.parse(body).data;
    expect(sams.find((s) => s.type === 'connection.failing')).toMatchObject({
      inApp: true,
      email: false,
    });
    expect(
      sams.find((s) => s.type === 'security.password-reset'),
    ).toMatchObject({ inApp: false, email: true });
    await as('sam')
      .put('/notifications/preferences')
      .send({ 'not.an-event': { email: true } })
      .expect(400);
    // Priya's are her own.
    expect(await choices('priya')).toEqual(priyas);

    await syncHudu('healthy');
    tools.failures['acme.hudu.test'] = 401;
    await syncHudu('failing');
    delete tools.failures['acme.hudu.test'];
    await expect(ofType('sam', 'connection.failing')).resolves.toHaveLength(2);
    expect(emailsTo(DEMO_EMAIL)).toHaveLength(1);
  });

  it('pages through the feed, and marks it read', async () => {
    const all = (await feed('sam', '?limit=100')).data;
    expect(all.length).toBeGreaterThanOrEqual(4);
    const first = await feed('sam', '?limit=1');
    expect(first.data).toEqual([all[0]]);
    expect(first.older).not.toBeNull();
    const second = await feed('sam', `?limit=1&before=${first.older}`);
    expect(second.data).toEqual([all[1]]);
    await as('sam').get('/notifications?before=nonsense').expect(400);

    const before = await unread('sam');
    expect(before).toBe(all.length);
    // Someone else's are left alone.
    await as('priya')
      .post('/notifications/read')
      .send({ ids: [all[0]!.id] })
      .expect(200)
      .expect({ marked: 0 });
    await as('sam')
      .post('/notifications/read')
      .send({ ids: [all[0]!.id] })
      .expect(200)
      .expect({ marked: 1 });
    await expect(unread('sam')).resolves.toBe(before - 1);
    const unreadOnly = await feed('sam', '?unread=true&limit=100');
    expect(unreadOnly.data.map((n) => n.id)).not.toContain(all[0]!.id);

    await as('sam').post('/notifications/read').send({}).expect(400);
    await as('sam')
      .post('/notifications/read')
      .send({ all: true })
      .expect(200)
      .expect({ marked: before - 1 });
    await expect(unread('sam')).resolves.toBe(0);
    expect((await feed('sam')).data.every((n) => n.readAt === NOW)).toBe(true);
  });

  it('tells the person whose role changed, not the one who changed it', async () => {
    const { body } = await as('sam').get('/members').expect(200);
    const priya = listOf(memberSchema)
      .parse(body)
      .data.find((m) => m.email === TECHNICIAN_EMAIL)!;
    await as('sam')
      .patch(`/members/${priya.id}`)
      .send({ role: 'admin' })
      .expect(200);
    await handOn();
    await expect(ofType('priya', 'member.role-changed')).resolves.toEqual([
      expect.objectContaining({
        title: 'You’re now an admin',
        body: 'You were a technician. Changed by Sam Okafor.',
        link: '/settings#people',
      }),
    ]);
    await expect(ofType('sam', 'member.role-changed')).resolves.toEqual([]);

    await as('sam')
      .patch(`/members/${priya.id}`)
      .send({ role: 'technician' })
      .expect(200);
    await handOn();
    await expect(ofType('priya', 'member.role-changed')).resolves.toHaveLength(
      2,
    );
  });

  it('tells everyone else, by email too, when a report can’t be sent', async () => {
    const id = 'copperleaf-studio-2026-w41';
    await as('sam')
      .put('/clients/copperleaf-studio/recipients')
      .send({ recipients: [{ name: '', email: 'hello@copperleaf.example' }] })
      .expect(200);
    await as('sam')
      .patch(`/reports/${id}`)
      .send({ status: 'approved' })
      .expect(200);
    const problem = 'Postmark rejected the server token.';
    const send = vi
      .spyOn(app.get(MAILER) as LogMailer, 'send')
      .mockRejectedValueOnce(new MailError(problem));
    await as('sam').post(`/reports/${id}/send`).expect(502);
    await handOn();
    send.mockRestore();

    await expect(ofType('priya', 'report.delivery-failed')).resolves.toEqual([
      expect.objectContaining({
        title: 'Copperleaf Studio’s weekly report couldn’t be sent',
        link: `/reports/${id}`,
      }),
    ]);
    expect(emailsTo(TECHNICIAN_EMAIL).map((mail) => mail.subject)).toContain(
      'Copperleaf Studio’s weekly report couldn’t be sent',
    );
    await expect(ofType('sam', 'report.delivery-failed')).resolves.toEqual([]);
  });

  it('tells admins once when an approved report has no one to go to', async () => {
    await as('sam')
      .put('/report-settings')
      .send({
        senderName: '',
        replyTo: null,
        brandColour: '#1f6feb',
        draftAt: null,
        sendAt: { weekday: 5, hour: 16 },
      })
      .expect(200);
    await as('sam')
      .patch('/reports/fenwick-rowe-2026-w41')
      .send({ status: 'approved' })
      .expect(200);
    const scheduler = app.get(ReportScheduler);
    await scheduler.tick();
    await scheduler.tick();
    await handOn();
    await expect(ofType('sam', 'report.no-recipients')).resolves.toEqual([
      expect.objectContaining({
        title: 'Fenwick & Rowe’s weekly report has no one to go to',
        link: '/clients/fenwick-rowe/reports',
      }),
    ]);
    await expect(ofType('priya', 'report.no-recipients')).resolves.toEqual([]);
  });

  it('tries an event again when a subscriber fails, without telling anyone twice', async () => {
    let calls = 0;
    const stop = app.get(EventBus).subscribe('flaky', async () => {
      calls += 1;
      if (calls === 1) throw new Error('Not yet');
    });
    try {
      // Hudu was left failing; this sync recovers it, and the flaky
      // subscriber turns down the first try.
      await syncHudu('healthy');
      expect(calls).toBe(1);
      await expect(ofType('sam', 'connection.recovered')).resolves.toHaveLength(
        3,
      );

      // Not due for another minute.
      await handOn(later(0.5));
      expect(calls).toBe(1);
      await handOn(later(2));
      expect(calls).toBe(2);
      // Handled twice, told once.
      await expect(ofType('sam', 'connection.recovered')).resolves.toHaveLength(
        3,
      );
      await handOn(later(10));
      expect(calls).toBe(2);
    } finally {
      stop();
    }
  });
});
