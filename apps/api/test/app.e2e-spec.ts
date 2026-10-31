import {
  auditCountSchema,
  auditPageSchema,
  type AuditEntry,
  type Invite,
  clientListItemSchema,
  clientSchema,
  connectorSchema,
  inviteSchema,
  listOf,
  meetingNoteSchema,
  memberSchema,
  notesInboxSchema,
  outboxItemSchema,
  recommendationSchema,
  reportDeliveryStatusSchema,
  reportEmailSchema,
  reportSchema,
  reportSettingsSchema,
  reportSummarySchema,
  sessionsSchema,
  twoFactorEnabledSchema,
  twoFactorSetupSchema,
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
import { base32Decode, hotp, stepAt } from '../src/auth/totp.js';
import { DATABASE } from '../src/database/database.module.js';
import { MAILER, MailError, type LogMailer } from '../src/mail/mailer.js';
import { ReportScheduler } from '../src/reports/report-scheduler.js';
import {
  E2E_CLIENT_IP_KEY,
  E2E_INBOUND_ADDRESS,
  E2E_INBOUND_TOKEN,
} from './fake-tools.js';
import { signUpWorkspace, skipOnboarding } from './accounts.js';

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
    put: (url: string) =>
      api().put(url).set('Authorization', `Bearer ${token}`),
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
      .send({ email: signUp.email, password: 'short' })
      .expect(400);

    const body = await signUpWorkspace(app, signUp);
    expect(body.me).toMatchObject({
      user: { name: 'Rae Kim', email: 'rae@kestrel.example', title: '' },
      workspace: { name: 'Kestrel Networks', timeZone: 'America/New_York' },
      role: 'owner',
      setup: 'done',
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

  describe('two-factor sign-in', () => {
    /** The app's code for a secret at a step from now (0 = this one). */
    const codeFor = (secret: string, offset = 0) =>
      hotp(base32Decode(secret), stepAt(Date.now()) + offset);
    async function newAccount(email: string) {
      const password = 'a long enough password';
      const body = await signUpWorkspace(app, {
        workspaceName: `Two-factor ${email}`,
        name: 'Tove Factor',
        email,
        password,
      });
      const bearer = `Bearer ${body.token}`;
      const asUser = (r: request.Test) => r.set('Authorization', bearer);
      const signIn = () =>
        api().post('/auth/sign-in').send({ email, password }).expect(200);
      const complete = (challenge: string, code: string) =>
        api().post('/auth/sign-in/two-factor').send({ challenge, code });
      /** Sets it up and turns it on; the secret and recovery codes. */
      async function turnOn() {
        const setup = twoFactorSetupSchema.parse(
          (await asUser(api().post('/auth/two-factor/setup')).expect(200)).body,
        );
        const { recoveryCodes } = twoFactorEnabledSchema.parse(
          (
            await asUser(api().post('/auth/two-factor/enable'))
              .send({ code: codeFor(setup.secret) })
              .expect(200)
          ).body,
        );
        return { secret: setup.secret, recoveryCodes };
      }
      return { asUser, signIn, complete, turnOn };
    }

    it('turns on with a code from the app, then asks for one at sign-in', async () => {
      const account = await newAccount('tove@example.com');
      const status = () =>
        account.asUser(api().get('/auth/two-factor')).expect(200);
      expect((await status()).body).toEqual({
        available: true,
        enabled: false,
        required: false,
        recoveryCodesLeft: 0,
      });

      const setup = twoFactorSetupSchema.parse(
        (await account.asUser(api().post('/auth/two-factor/setup')).expect(200))
          .body,
      );
      expect(setup.uri).toContain(`secret=${setup.secret}`);
      await account
        .asUser(api().post('/auth/two-factor/enable'))
        .send({
          code: '000000' === codeFor(setup.secret) ? '111111' : '000000',
        })
        .expect(400);
      const enableCode = codeFor(setup.secret);
      const { recoveryCodes } = twoFactorEnabledSchema.parse(
        (
          await account
            .asUser(api().post('/auth/two-factor/enable'))
            .send({ code: enableCode })
            .expect(200)
        ).body,
      );
      expect(recoveryCodes).toHaveLength(10);
      expect((await status()).body).toMatchObject({
        enabled: true,
        recoveryCodesLeft: 10,
      });
      await account.asUser(api().post('/auth/two-factor/setup')).expect(409);

      // The password alone no longer starts a session.
      const step = await account.signIn();
      expect(step.body).toEqual({
        twoFactorRequired: true,
        challenge: expect.any(String),
      });
      // The code that turned it on was used up.
      await account.complete(step.body.challenge, enableCode).expect(401);
      const signedIn = await account
        .complete(step.body.challenge, codeFor(setup.secret, 1))
        .expect(200);
      expect(signedIn.body.token).toEqual(expect.any(String));

      // A recovery code works once.
      const again = await account.signIn();
      await account
        .complete(again.body.challenge, recoveryCodes[0]!.toUpperCase())
        .expect(200);
      await account
        .complete(again.body.challenge, recoveryCodes[0]!)
        .expect(401);
      const { data } = auditPageSchema.parse(
        (await account.asUser(api().get('/audit?kind=sign-in')).expect(200))
          .body,
      );
      expect(data.map((e) => e.what)).toEqual(
        expect.arrayContaining([
          'Turned on two-factor sign-in',
          'Password accepted; asked for the two-factor code',
          'Signed in with two-factor',
          'Signed in with a recovery code (9 left)',
          'Two-factor code didn’t match',
        ]),
      );

      await account
        .complete('not-a-real-challenge', codeFor(setup.secret))
        .expect(400);

      // Turning it off takes a code, then sign-in is the password again.
      await account
        .asUser(api().post('/auth/two-factor/disable'))
        .send({ code: '12345678' })
        .expect(400);
      await account
        .asUser(api().post('/auth/two-factor/disable'))
        .send({ code: recoveryCodes[1]! })
        .expect(204);
      expect((await account.signIn()).body.token).toEqual(expect.any(String));
    });

    it('still asks for the code after a password reset', async () => {
      const email = 'reset-tove@example.com';
      const account = await newAccount(email);
      const { secret } = await account.turnOn();
      const db = app.get<DatabaseAdapter>(DATABASE);
      const token = 'a-reset-token-for-two-factor';
      await db.passwordResets.create({
        tokenHash: hashToken(token),
        userId: (await db.users.findByEmail(email))!.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      const reset = await api()
        .post('/auth/password-reset/confirm')
        .send({ token, password: 'a brand new long password' })
        .expect(200);
      expect(reset.body).toMatchObject({ twoFactorRequired: true });
      await account
        .complete(reset.body.challenge, codeFor(secret, 1))
        .expect(200);
    });

    it('stops accepting codes after five wrong ones', async () => {
      const account = await newAccount('guessing-tove@example.com');
      await account.turnOn();
      const { body } = await account.signIn();
      for (let i = 0; i < 5; i++) {
        await account.complete(body.challenge, `00000${i}`).expect(401);
      }
      const refused = await account
        .complete(body.challenge, '000005')
        .expect(429);
      expect(refused.body.message).toBe(
        'Too many wrong codes. Wait a few minutes and try again.',
      );
    });
  });

  describe('sessions', () => {
    const HOUR = 3_600_000;
    /** A session for Sam, last used `ago` milliseconds back. */
    async function sessionUsed(ago: number) {
      const token = `e2e-session-${Math.random().toString(36).slice(2)}`;
      const now = Date.now();
      await app.get<DatabaseAdapter>(DATABASE).sessions.create({
        tokenHash: hashToken(token),
        userId: demo.users[0]!.id,
        workspaceId: demo.workspace.id,
        createdAt: new Date(now - 100 * HOUR).toISOString(),
        expiresAt: new Date(now + 100 * HOUR).toISOString(),
        lastSeenAt: new Date(now - ago).toISOString(),
      });
      const find = () =>
        app.get<DatabaseAdapter>(DATABASE).sessions.find(hashToken(token));
      return { bearer: `Bearer ${token}`, find };
    }

    it('ends a session that went unused for SESSION_IDLE_HOURS', async () => {
      const idle = await sessionUsed(73 * HOUR);
      await api().get('/auth/me').set('Authorization', idle.bearer).expect(401);
      await expect(idle.find()).resolves.toBeNull();
    });

    it('notes a session’s use every few minutes, not on every request', async () => {
      const stale = await sessionUsed(10 * 60_000);
      await api()
        .get('/auth/me')
        .set('Authorization', stale.bearer)
        .expect(200);
      const touched = await stale.find();
      expect(Date.now() - Date.parse(touched!.lastSeenAt)).toBeLessThan(60_000);

      const fresh = await sessionUsed(60_000);
      const before = (await fresh.find())!.lastSeenAt;
      await api()
        .get('/auth/me')
        .set('Authorization', fresh.bearer)
        .expect(200);
      await expect(fresh.find()).resolves.toMatchObject({ lastSeenAt: before });
    });

    it('signs out everywhere else, keeping this session', async () => {
      const email = 'kai@heron.example';
      const password = 'kai’s long password';
      const first = await signUpWorkspace(app, {
        workspaceName: 'Heron Two',
        name: 'Kai',
        email,
        password,
      });
      const signIn = async () =>
        `Bearer ${(await api().post('/auth/sign-in').send({ email, password }).expect(200)).body.token}`;
      const here = `Bearer ${first.token}`;
      const [laptop, phone] = [await signIn(), await signIn()];

      const sessions = sessionsSchema.parse(
        (
          await api()
            .get('/auth/sessions')
            .set('Authorization', here)
            .expect(200)
        ).body,
      );
      expect(sessions).toMatchObject({ others: 2, idleHours: 72 });
      expect(sessions.othersLastSeenAt).not.toBeNull();

      await api()
        .post('/auth/sessions/sign-out-others')
        .set('Authorization', here)
        .expect(204);
      await api().get('/auth/me').set('Authorization', laptop).expect(401);
      await api().get('/auth/me').set('Authorization', phone).expect(401);
      const after = await api()
        .get('/auth/sessions')
        .set('Authorization', here)
        .expect(200);
      expect(after.body).toMatchObject({ others: 0, othersLastSeenAt: null });
      const { data } = auditPageSchema.parse(
        (await api().get('/audit?kind=sign-in').set('Authorization', here))
          .body,
      );
      expect(data[0]?.what).toBe('Signed out everywhere else');
    });
  });

  describe('rate limits', () => {
    /** Requests as if from `ip`, vouched for the way the web app does. */
    const from = (ip: string, key = E2E_CLIENT_IP_KEY) => ({
      'x-dossier-client-ip': ip,
      'x-dossier-client-ip-key': key,
    });
    const failSignIn = (email: string, headers: Record<string, string> = {}) =>
      api()
        .post('/auth/sign-in')
        .set(headers)
        .send({ email, password: 'not the password' });

    it('keeps lockouts across a restart', async () => {
      const email = 'restart@larkspur-it.example';
      for (let i = 0; i < 5; i++) await failSignIn(email).expect(401);

      // A second API on the same database, as after a restart or on
      // another instance.
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DATABASE)
        .useValue(app.get(DATABASE))
        .compile();
      const restarted = moduleRef.createNestApplication();
      await restarted.init();
      try {
        await request(restarted.getHttpServer())
          .post('/auth/sign-in')
          .send({ email, password: 'not the password' })
          .expect(429);
      } finally {
        await restarted.close();
      }
    });

    it('limits failed sign-ins per address, only when the web app vouches for it', async () => {
      for (let i = 0; i < 20; i++) {
        await failSignIn(`spray-${i}@example.com`, from('203.0.113.50')).expect(
          401,
        );
      }
      await failSignIn('spray-new@example.com', from('203.0.113.50')).expect(
        429,
      );
      // Another address, or an address nobody vouched for, isn't blocked.
      await failSignIn('spray-new@example.com', from('203.0.113.51')).expect(
        401,
      );
      await failSignIn(
        'spray-other@example.com',
        from('203.0.113.50', 'a-key-that-is-wrong-but-long-enough!'),
      ).expect(401);
      await failSignIn('spray-other@example.com', {
        'x-dossier-client-ip': '203.0.113.50',
      }).expect(401);
      // Each attempt checks a password the slow way on purpose.
    }, 30_000);

    it('limits sign-ups per address', async () => {
      const signUp = (i: number) =>
        api()
          .post('/auth/sign-up')
          .set(from('203.0.113.70'))
          .send({
            email: `flood-${i}@example.com`,
            password: 'long enough password',
          });
      for (let i = 0; i < 5; i++) await signUp(i).expect(202);
      const refused = await signUp(5).expect(429);
      expect(refused.body.message).toBe(
        'Too many sign-ups from your network, or for this email. Try again in an hour.',
      );
    });

    it('records where a sign-in came from', async () => {
      await api()
        .post('/auth/sign-in')
        .set(from('203.0.113.60'))
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
      const { data } = auditPageSchema.parse(
        (await as.get('/audit?kind=sign-in&limit=5').expect(200)).body,
      );
      expect(data.find((e) => e.what === 'Signed in')?.ip).toBe('203.0.113.60');
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
      const signUp = await signUpWorkspace(app, {
        workspaceName: 'Heron IT',
        timeZone: 'Europe/London',
        name: 'Lin Park',
        email,
        password: 'the first password',
      });
      const oldSession = `Bearer ${signUp.token}`;

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

  describe('people and invites', () => {
    /** The token in the newest invite emailed to `email`, once it arrives. */
    function inviteToken(email: string): string {
      const mail = (app.get(MAILER) as LogMailer).outbox.findLast((m) =>
        m.to.includes(email),
      );
      const token = mail && /\/invite\?token=([\w-]+)/.exec(mail.text);
      if (!token) throw new Error(`No invite reached ${email}`);
      return token[1]!;
    }
    const bearerOf = async (email: string, password = DEMO_PASSWORD) =>
      `Bearer ${
        (
          await api()
            .post('/auth/sign-in')
            .send({ email, password })
            .expect(200)
        ).body.token
      }`;

    it('invites a technician, who joins with the link once', async () => {
      const email = 'ivy@larkspur-it.example';
      const before = listOf(memberSchema).parse(
        (await as.get('/members').expect(200)).body,
      );
      expect(before.data.map((m) => [m.name, m.role])).toEqual([
        ['Priya Nair', 'technician'],
        ['Sam Okafor', 'owner'],
      ]);

      const tech = await bearerOf(TECHNICIAN_EMAIL);
      await api()
        .post('/members/invites')
        .set('Authorization', tech)
        .send({ email, role: 'technician' })
        .expect(403);
      await as
        .post('/members/invites')
        .send({ email: TECHNICIAN_EMAIL.toUpperCase(), role: 'admin' })
        .expect(409);
      await as
        .post('/members/invites')
        .send({ email, role: 'owner' })
        .expect(400);

      const sent = inviteSchema.parse(
        (
          await as
            .post('/members/invites')
            .send({ email: 'IVY@larkspur-it.example', role: 'technician' })
            .expect(201)
        ).body,
      );
      expect(sent).toMatchObject({ email, invitedBy: 'Sam Okafor' });
      const mail = (app.get(MAILER) as LogMailer).outbox.findLast((m) =>
        m.to.includes(email),
      )!;
      expect(mail.subject).toBe(
        'Sam Okafor invited you to Larkspur IT on Dossier',
      );
      expect(mail.replyTo).toBe(DEMO_EMAIL);
      const token = inviteToken(email);
      const pending = await as.get('/members/invites').expect(200);
      expect(pending.body.data.map((i: Invite) => i.email)).toEqual([email]);

      const preview = await api()
        .post('/auth/invites/preview')
        .send({ token })
        .expect(200);
      expect(preview.body).toEqual({
        workspaceName: 'Larkspur IT',
        email,
        role: 'technician',
        invitedBy: 'Sam Okafor',
      });

      await api()
        .post('/auth/invites/accept')
        .send({ token, name: 'Ivy Chen', password: 'short' })
        .expect(400);
      const joined = await api()
        .post('/auth/invites/accept')
        .send({ token, name: 'Ivy Chen', password: 'ivy’s long password' })
        .expect(200);
      expect(joined.body.me).toMatchObject({
        user: { name: 'Ivy Chen', email },
        workspace: { id: 'larkspur-it' },
        role: 'technician',
        setup: 'onboarding',
      });
      await skipOnboarding(app, joined.body.me.user.id);
      await api()
        .post('/auth/invites/accept')
        .send({ token, name: 'Ivy Again', password: 'another long password' })
        .expect(400);
      await as.get('/members/invites').expect(200).expect({ data: [] });
    });

    it('lets owners and admins manage people, and keeps an owner', async () => {
      const members = listOf(memberSchema).parse(
        (await as.get('/members').expect(200)).body,
      ).data;
      const ivy = members.find((m) => m.name === 'Ivy Chen')!;
      const sam = members.find((m) => m.role === 'owner')!;

      const promoted = await as
        .patch(`/members/${ivy.id}`)
        .send({ role: 'admin' })
        .expect(200);
      expect(promoted.body.role).toBe('admin');

      const ivyBearer = await bearerOf(ivy.email, 'ivy’s long password');
      const asIvy = (r: request.Test) => r.set('Authorization', ivyBearer);
      const refused = await asIvy(
        api().patch(`/members/${ivy.id}`).send({ role: 'owner' }),
      ).expect(403);
      expect(refused.body.message).toBe(
        'Only an owner can make someone an owner, or change or remove an owner.',
      );
      await asIvy(api().delete(`/members/${sam.id}`)).expect(403);

      const last = await as
        .patch(`/members/${sam.id}`)
        .send({ role: 'admin' })
        .expect(409);
      expect(last.body.message).toBe(
        'A workspace needs an owner. Make someone else an owner first.',
      );
      await as.delete(`/members/${sam.id}`).expect(409);

      await as.delete(`/members/${ivy.id}`).expect(204);
      await asIvy(api().get('/auth/me')).expect(401);
      await api()
        .post('/auth/sign-in')
        .send({ email: ivy.email, password: 'ivy’s long password' })
        .expect(401);
      await as.delete(`/members/${ivy.id}`).expect(404);

      const changes = auditPageSchema
        .parse((await as.get('/audit?kind=change').expect(200)).body)
        .data.map((e) => e.what);
      expect(changes).toEqual(
        expect.arrayContaining([
          'Invited ivy@larkspur-it.example as a technician',
          'Made Ivy Chen an admin (was a technician)',
          'Removed Ivy Chen (ivy@larkspur-it.example) from the workspace',
        ]),
      );
    });

    it('withdraws an invite, so its link stops working', async () => {
      const email = 'jo@larkspur-it.example';
      const sent = inviteSchema.parse(
        (
          await as
            .post('/members/invites')
            .send({ email, role: 'admin' })
            .expect(201)
        ).body,
      );
      const token = inviteToken(email);
      await as.delete(`/members/invites/${sent.id}`).expect(204);
      await as.delete(`/members/invites/${sent.id}`).expect(404);
      await api().post('/auth/invites/preview').send({ token }).expect(400);
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
        post: (url: string) => api().post(url).set('Authorization', bearer),
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
      // Testing the saved connection is fine; trying new credentials isn't.
      await tech
        .post('/connectors/test')
        .send({ tool: 'hudu', url: 'https://x.test', apiKey: 'k' })
        .expect(403);
      const test = await tech.post('/connectors/hudu/test').expect(200);
      expect(test.body).toEqual({
        ok: false,
        problem: expect.stringContaining(
          'can’t read the saved Hudu credentials',
        ),
      });
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
      // Reads only, as sign-ins grow while tests run: the demo's, plus any a
      // person asked for earlier, like a technician testing a connection.
      const counts = listOf(auditCountSchema).parse(
        (await as.get('/audit/counts').expect(200)).body,
      );
      const reads = counts.data
        .filter((c) => c.kind === 'read')
        .reduce((sum, c) => sum + c.count, 0);
      expect(reads).toBeGreaterThanOrEqual(
        demo.auditLog.filter((e) => e.kind === 'read').length,
      );
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
      expect(pages.map((p) => p.data.length)).toEqual([20, 20, reads - 40]);
      expect(new Set(ids).size).toBe(reads);

      // Newer goes back the same way; past the top it shows the newest page.
      const back = await page(`&after=${pages[2]!.newer}`);
      expect(back).toEqual(pages[1]);
      await expect(page(`&after=${pages[1]!.newer}`)).resolves.toEqual(newest);

      await as.get('/audit?before=not-a-cursor').expect(400);
      await as
        .get(`/audit?before=${newest.older}&after=${back.newer}`)
        .expect(400);

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

  describe('meeting notes', () => {
    const client = demo.clients[0]!;
    const notes = async (clientId: string) =>
      listOf(meetingNoteSchema).parse(
        (await as.get(`/notes?clientId=${clientId}`).expect(200)).body,
      ).data;
    const inbox = async () =>
      notesInboxSchema.parse((await as.get('/notes/inbox').expect(200)).body);
    const postmark = (body: object, password = E2E_INBOUND_TOKEN) =>
      api().post('/inbound/postmark').auth('postmark', password).send(body);

    it('adds notes to a client or the inbox, and files them', async () => {
      await as
        .post('/notes')
        .send({ clientId: client.id, occurredOn: '2026-10-08', body: ' ' })
        .expect(400);
      await as
        .post('/notes')
        .send({ clientId: 'nobody', occurredOn: '2026-10-08', body: 'Hi' })
        .expect(404);

      const { body: filed } = await as
        .post('/notes')
        .send({
          clientId: client.id,
          occurredOn: '2026-10-08',
          attendees: ['Priya Nair', 'Sam Okafor'],
          body: 'They want to open a second site in March.',
        })
        .expect(201);
      expect(meetingNoteSchema.parse(filed)).toMatchObject({
        clientId: client.id,
        title: 'Meeting notes',
        via: 'paste',
        addedBy: { name: 'Sam Okafor' },
      });
      expect(await notes(client.id)).toEqual([filed]);

      const { body: waiting } = await as
        .post('/notes')
        .send({
          title: 'Call with a new prospect',
          occurredOn: '2026-10-07',
          body: 'Wants a quote for 20 seats.',
        })
        .expect(201);
      expect((await inbox()).notes).toEqual([waiting]);

      const { body: moved } = await as
        .patch(`/notes/${waiting.id}`)
        .send({ clientId: client.id })
        .expect(200);
      expect(moved.clientId).toBe(client.id);
      expect((await notes(client.id)).map((n) => n.id)).toEqual([
        filed.id,
        waiting.id,
      ]);
      await as
        .patch(`/notes/${waiting.id}`)
        .send({ clientId: 'nobody' })
        .expect(404);
      await as
        .patch(`/notes/${waiting.id}`)
        .send({ clientId: null })
        .expect(200);
      expect((await inbox()).notes.map((n) => n.id)).toEqual([waiting.id]);

      await as.delete(`/notes/${waiting.id}`).expect(204);
      await as.delete(`/notes/${waiting.id}`).expect(404);
      await as.patch('/notes/nope').send({ clientId: null }).expect(404);
      expect((await inbox()).notes).toEqual([]);
    });

    it('gives the workspace one address to forward notes to', async () => {
      const { address } = await inbox();
      const [local, domain] = E2E_INBOUND_ADDRESS.split('@');
      expect(address).toMatch(
        new RegExp(
          `^${local}\\+[0-9a-f]{20}@${domain!.replaceAll('.', '\\.')}$`,
        ),
      );
      expect((await inbox()).address).toBe(address);
    });

    it('takes notes forwarded by people in the workspace, and only them', async () => {
      const { address } = await inbox();
      const token = address!.split('+')[1]!.split('@')[0]!;
      const forwarded = (from: string, text: string) => ({
        FromFull: { Email: from, Name: 'Someone' },
        ToFull: [{ Email: address, MailboxHash: token }],
        OriginalRecipient: address,
        MailboxHash: token,
        Subject: 'Fwd: Quarterly review',
        Date: 'Thu, 8 Oct 2026 16:00:00 +0100',
        TextBody: text,
      });

      // Without the webhook's token, or not from Postmark: no.
      await api()
        .post('/inbound/postmark')
        .send(forwarded(DEMO_EMAIL, 'x'))
        .expect(401);
      await postmark(forwarded(DEMO_EMAIL, 'x'), 'wrong').expect(401);
      await postmark({ hello: 'there' }).expect(400);

      // Strangers, and unknown addresses, are dropped without a fuss.
      await postmark(forwarded('eve@elsewhere.example', 'Buy now'))
        .expect(200)
        .expect({ status: 'ignored' });
      await postmark({
        ...forwarded(DEMO_EMAIL, 'x'),
        MailboxHash: 'f'.repeat(20),
        ToFull: [],
        OriginalRecipient: '',
      })
        .expect(200)
        .expect({ status: 'ignored' });

      // Mentioning one client's people files the notes with that client.
      await postmark(
        forwarded(
          TECHNICIAN_EMAIL.toUpperCase(),
          `From: Ann <ann@${client.domains[0]}>\nThey asked about Microsoft 365 licences.`,
        ),
      )
        .expect(200)
        .expect({ status: 'added' });
      const [emailed] = await notes(client.id);
      expect(emailed).toMatchObject({
        title: 'Quarterly review',
        occurredOn: '2026-10-08',
        via: 'email',
        addedBy: { name: 'Priya Nair' },
        body: expect.stringContaining('Microsoft 365 licences'),
      });

      // Anything else waits in the inbox.
      await postmark(forwarded(DEMO_EMAIL, 'Notes from the call.'))
        .expect(200)
        .expect({ status: 'added' });
      expect((await inbox()).notes).toEqual([
        expect.objectContaining({
          body: 'Notes from the call.',
          clientId: null,
        }),
      ]);

      const changes = auditPageSchema.parse(
        (await as.get('/audit?kind=change&limit=10').expect(200)).body,
      ).data;
      expect(
        changes.map((e) => [e.what, e.outcome, e.actor?.name ?? null]),
      ).toEqual(
        expect.arrayContaining([
          [
            'Emailed the meeting notes “Quarterly review” to the inbox',
            'ok',
            'Sam Okafor',
          ],
          ['Emailed the meeting notes “Quarterly review”', 'ok', 'Priya Nair'],
          [
            'Ignored notes emailed from eve@elsewhere.example, who isn’t in this workspace',
            'failed',
            null,
          ],
        ]),
      );
    });
  });

  describe('report delivery', () => {
    const mailer = () => app.get(MAILER) as LogMailer;
    const settings = {
      senderName: ' Larkspur IT ',
      replyTo: 'Help@Larkspur-IT.example',
      brandColour: '#1F6FEB',
      draftAt: { weekday: 5, hour: 7 },
      sendAt: null,
    };
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(24, 7),
    ]);
    const changes = async () =>
      auditPageSchema.parse(
        (await as.get('/audit?kind=change&limit=200').expect(200)).body,
      ).data;
    const statusOf = async (id: string) =>
      reportDeliveryStatusSchema.parse(
        (await as.get(`/reports/${id}/delivery`).expect(200)).body,
      );
    const lineOf = async (id: string) =>
      reportSchema
        .parse((await as.get(`/reports/${id}`).expect(200)).body)
        .sections.flatMap((s) => s.lines)[0]!;

    it('keeps branding and a schedule, which only admins change', async () => {
      expect(
        reportSettingsSchema.parse(
          (await as.get('/report-settings').expect(200)).body,
        ),
      ).toEqual({
        senderName: '',
        replyTo: null,
        brandColour: '#1f2937',
        logo: null,
        draftAt: null,
        sendAt: null,
      });
      const saved = await as.put('/report-settings').send(settings).expect(200);
      expect(saved.body).toEqual({
        senderName: 'Larkspur IT',
        replyTo: 'help@larkspur-it.example',
        brandColour: '#1f6feb',
        logo: null,
        draftAt: { weekday: 5, hour: 7 },
        sendAt: null,
      });
      await as
        .put('/report-settings')
        .send({ ...settings, brandColour: 'blue' })
        .expect(400);
      await as
        .put('/report-settings')
        .send({ ...settings, draftAt: { weekday: 8, hour: 7 } })
        .expect(400);

      const logo = await as
        .put('/report-settings/logo')
        .set('content-type', 'image/png')
        .send(png)
        .expect(200);
      expect(logo.body.logo).toBe(
        `data:image/png;base64,${png.toString('base64')}`,
      );
      // Saving the rest keeps the logo.
      await as.put('/report-settings').send(settings).expect(200);
      expect((await as.get('/report-settings').expect(200)).body.logo).toBe(
        logo.body.logo,
      );
      await as
        .put('/report-settings/logo')
        .set('content-type', 'image/jpeg')
        .send(png)
        .expect(415);
      await as
        .put('/report-settings/logo')
        .set('content-type', 'image/svg+xml')
        .send('<svg xmlns="http://www.w3.org/2000/svg"/>')
        .expect(415);
      const big = await as
        .put('/report-settings/logo')
        .set('content-type', 'image/png')
        .send(Buffer.concat([png, Buffer.alloc(256 * 1024)]))
        .expect(413);
      expect(big.body.message).toBe('Keep the logo under 256 KB.');

      const session = await api()
        .post('/auth/sign-in')
        .send({ email: TECHNICIAN_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
      const bearer = `Bearer ${session.body.token}`;
      await api()
        .get('/report-settings')
        .set('Authorization', bearer)
        .expect(200);
      await api()
        .put('/report-settings')
        .set('Authorization', bearer)
        .send(settings)
        .expect(403);
      await api()
        .put('/report-settings/logo')
        .set('Authorization', bearer)
        .set('content-type', 'image/png')
        .send(png)
        .expect(403);
      await api()
        .put('/clients/harbour-dental/recipients')
        .set('Authorization', bearer)
        .send({ recipients: [] })
        .expect(403);
    });

    it('keeps who each client’s report goes to', async () => {
      const url = '/clients/harbour-dental/recipients';
      await as.get(url).expect(200).expect({ data: [] });
      const saved = await as
        .put(url)
        .send({
          recipients: [
            { name: 'Priya Shah', email: 'Priya@HarbourDental.example' },
            { name: '', email: 'office@harbourdental.example', copy: true },
          ],
        })
        .expect(200);
      expect(saved.body.data).toEqual([
        {
          name: 'Priya Shah',
          email: 'priya@harbourdental.example',
          copy: false,
        },
        { name: '', email: 'office@harbourdental.example', copy: true },
      ]);
      await as.get(url).expect(200).expect(saved.body);

      const twice = await as
        .put(url)
        .send({
          recipients: [
            { name: '', email: 'a@harbourdental.example' },
            { name: '', email: 'A@harbourdental.example' },
          ],
        })
        .expect(400);
      expect(twice.body.errors[0].message).toMatch(/once/);
      await as
        .put(url)
        .send({
          recipients: [
            { name: '', email: 'cc@harbourdental.example', copy: true },
          ],
        })
        .expect(400);
      await as
        .put('/clients/no-such-client/recipients')
        .send({ recipients: [] })
        .expect(404);
      await as.get('/clients/no-such-client/recipients').expect(404);
    });

    it('refuses to approve in bulk reports with something to check', async () => {
      const queue = listOf(reportSummarySchema).parse(
        (await as.get('/reports/queue').expect(200)).body,
      ).data;
      // Every draft says Hudu hasn't synced by now, so all are flagged.
      const flagged = queue.slice(0, 2).map((r) => r.id);
      expect(queue.slice(0, 2).every((r) => r.exceptions.length > 0)).toBe(
        true,
      );
      const refused = await as
        .post('/reports/status')
        .send({ ids: flagged, status: 'approved' })
        .expect(422);
      expect(refused.body).toMatchObject({ ids: flagged });
      expect(refused.body.message).toMatch(/something to check/);
      await expect(
        as.get('/reports/queue').then((res) => res.body.data.length),
      ).resolves.toBe(queue.length);
    });

    it('sends an approved report once, branded, and keeps it as it went', async () => {
      const id = 'fenwick-rowe-2026-w41';
      await as
        .put('/clients/fenwick-rowe/recipients')
        .send({
          recipients: [
            { name: 'Tom Rowe', email: 'tom@fenwickrowe.example' },
            { name: '', email: 'accounts@fenwickrowe.example', copy: true },
          ],
        })
        .expect(200);
      const notYet = await as.post(`/reports/${id}/send`).expect(409);
      expect(notYet.body.message).toBe(
        'Approve the report before it goes out.',
      );

      // A draft can be read as the email it would be, and its lines changed.
      const preview = reportEmailSchema.parse(
        (await as.get(`/reports/${id}/email`).expect(200)).body,
      );
      expect(preview).toMatchObject({
        from: expect.stringMatching(/^"Larkspur IT" </),
        to: ['tom@fenwickrowe.example'],
        cc: ['accounts@fenwickrowe.example'],
        replyTo: 'help@larkspur-it.example',
        subject: 'Fenwick & Rowe weekly report, 5–11 Oct 2026',
      });
      expect(preview.html).toContain(`src="data:image/png;base64,`);
      const line = await lineOf(id);
      const edited = reportSchema.parse(
        (
          await as
            .patch(`/reports/${id}`)
            .send({ lines: [{ id: line.id, text: 'Reworded by Sam.' }] })
            .expect(200)
        ).body,
      );
      expect(edited).toMatchObject({ editedAt: NOW });
      await as
        .patch(`/reports/${id}`)
        .send({ status: 'approved', lines: [{ id: line.id, text: 'x' }] })
        .expect(400);
      await as.patch(`/reports/${id}`).send({ lines: [] }).expect(400);
      await as.patch(`/reports/${id}`).send({ status: 'approved' }).expect(200);
      await expect(statusOf(id)).resolves.toEqual({
        to: ['tom@fenwickrowe.example'],
        cc: ['accounts@fenwickrowe.example'],
        sendAt: null,
        sendsAt: null,
        deliveries: [],
      });

      const sent = await as.post(`/reports/${id}/send`).expect(201);
      expect(sent.body).toMatchObject({
        reportId: id,
        clientId: 'fenwick-rowe',
        at: NOW,
        to: ['tom@fenwickrowe.example'],
        cc: ['accounts@fenwickrowe.example'],
        outcome: 'sent',
        problem: null,
        sentBy: { name: 'Sam Okafor' },
      });
      const mail = mailer().outbox.at(-1)!;
      expect(mail).toMatchObject({
        to: ['tom@fenwickrowe.example'],
        cc: ['accounts@fenwickrowe.example'],
        from: expect.stringMatching(/^"Larkspur IT" </),
        replyTo: 'help@larkspur-it.example',
        subject: 'Fenwick & Rowe weekly report, 5–11 Oct 2026',
        tag: 'weekly-report',
      });
      expect(mail.html).toContain('src="cid:logo"');
      expect(mail.html).toContain('Reworded by Sam.');
      expect(mail.attachments).toEqual([
        {
          name: 'logo.png',
          contentType: 'image/png',
          content: png.toString('base64'),
          contentId: 'logo',
        },
      ]);

      // Once, and as it went.
      await as.post(`/reports/${id}/send`).expect(409);
      await as.patch(`/reports/${id}`).send({ status: 'draft' }).expect(409);
      await as
        .post('/reports/status')
        .send({ ids: [id], status: 'skipped' })
        .expect(409);
      await as
        .patch(`/reports/${id}`)
        .send({ lines: [{ id: line.id, text: 'Later.' }] })
        .expect(409);
      await as.post('/reports').send({ clientId: 'fenwick-rowe' }).expect(409);
      const summary = reportSummarySchema.parse(
        (await as.get(`/reports/${id}`).expect(200)).body,
      );
      expect(summary).toMatchObject({ status: 'approved', sentAt: NOW });
      expect((await statusOf(id)).deliveries).toHaveLength(1);
      expect((await changes())[0]).toMatchObject({
        clientId: 'fenwick-rowe',
        outcome: 'ok',
        what: 'Sent the weekly report for the week of 5 Oct 2026 to tom@fenwickrowe.example, accounts@fenwickrowe.example',
        actor: expect.objectContaining({ name: 'Sam Okafor' }),
      });
    });

    it('logs a send the mail provider turns down, until someone sends it again', async () => {
      const id = 'copperleaf-studio-2026-w41';
      await as
        .put('/clients/copperleaf-studio/recipients')
        .send({ recipients: [{ name: '', email: 'hello@copperleaf.example' }] })
        .expect(200);
      await as.patch(`/reports/${id}`).send({ status: 'approved' }).expect(200);
      const problem =
        'Postmark rejected the server token. Check POSTMARK_SERVER_TOKEN.';
      const send = vi
        .spyOn(mailer(), 'send')
        .mockRejectedValueOnce(new MailError(problem));
      const failed = await as.post(`/reports/${id}/send`).expect(502);
      expect(failed.body.message).toBe(problem);
      const after = await statusOf(id);
      expect(after.deliveries).toEqual([
        expect.objectContaining({ outcome: 'failed', problem }),
      ]);
      expect(
        reportSummarySchema.parse((await as.get(`/reports/${id}`)).body).sentAt,
      ).toBeNull();
      expect((await changes())[0]).toMatchObject({
        what: `Couldn’t send the weekly report for the week of 5 Oct 2026: ${problem}`,
        outcome: 'failed',
      });

      await as.post(`/reports/${id}/send`).expect(201);
      // Both at the pinned clock's time, so in no particular order.
      expect(
        (await statusOf(id)).deliveries.map((d) => d.outcome).sort(),
      ).toEqual(['failed', 'sent']);
      send.mockRestore();
    });

    it('drafts and sends on the workspace’s schedule', async () => {
      const scheduler = app.get(ReportScheduler);
      const onSchedule = async () =>
        (await changes()).filter((e) => e.what.endsWith(', on schedule'));

      // Drafting is set for Fridays at 07:00; the clock says Friday 16:40.
      await scheduler.tick('2026-10-05T08:00:00.000Z');
      await expect(onSchedule()).resolves.toEqual([]);
      await scheduler.tick();
      const drafted = await onSchedule();
      expect(drafted.length).toBeGreaterThan(0);
      expect(drafted.every((e) => e.actor === null)).toBe(true);
      expect(drafted[0]!.what).toBe(
        'Drafted the weekly report for the week of 5 Oct 2026, on schedule',
      );
      // Once a week.
      await scheduler.tick();
      await expect(onSchedule()).resolves.toHaveLength(drafted.length);
      // The reports already sent stayed as they went.
      expect(
        drafted.some((e) =>
          ['fenwick-rowe', 'copperleaf-studio'].includes(e.clientId!),
        ),
      ).toBe(false);

      // Sending on Fridays at 16:00, which has passed: approve and it goes.
      await as
        .put('/report-settings')
        .send({ ...settings, sendAt: { weekday: 5, hour: 16 } })
        .expect(200);
      const queue = listOf(reportSummarySchema).parse(
        (await as.get('/reports/queue').expect(200)).body,
      ).data;
      // Harbour Dental has recipients from earlier; these two have none.
      const [waiting, nobody] = queue.filter(
        (r) => r.clientId !== 'harbour-dental',
      );
      if (!waiting || !nobody)
        throw new Error('Expected two drafts to approve');
      await as
        .put(`/clients/${waiting.clientId}/recipients`)
        .send({ recipients: [{ name: '', email: 'it@waiting.example' }] })
        .expect(200);
      for (const report of [waiting, nobody]) {
        await as
          .patch(`/reports/${report.id}`)
          .send({ status: 'approved' })
          .expect(200);
      }
      await expect(statusOf(waiting.id)).resolves.toMatchObject({
        sendAt: { weekday: 5, hour: 16 },
        sendsAt: NOW,
      });

      const outbox = listOf(outboxItemSchema).parse(
        (await as.get('/reports/outbox').expect(200)).body,
      ).data;
      expect(outbox).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reportId: waiting.id,
            sendsAt: NOW,
            recipients: 1,
          }),
          expect.objectContaining({
            reportId: nobody.id,
            sendsAt: null,
            recipients: 0,
          }),
        ]),
      );

      await scheduler.tick();
      expect(mailer().outbox.at(-1)).toMatchObject({
        to: ['it@waiting.example'],
      });
      await expect(statusOf(waiting.id)).resolves.toMatchObject({
        sendsAt: null,
        deliveries: [
          expect.objectContaining({ outcome: 'sent', sentBy: null }),
        ],
      });
      // No one to send to: it waits, and says so.
      await expect(statusOf(nobody.id)).resolves.toMatchObject({
        to: [],
        sendsAt: null,
        deliveries: [],
      });
      const left = listOf(outboxItemSchema).parse(
        (await as.get('/reports/outbox').expect(200)).body,
      ).data;
      expect(left.map((item) => item.reportId)).not.toContain(waiting.id);
      expect(left.map((item) => item.reportId)).toContain(nobody.id);
    });
  });

  describe('contracts', () => {
    const id = 'oakline-architects';
    const contract = {
      plan: ' Managed Plus ',
      startedOn: '2026-04-01',
      renewsOn: '2028-03-31',
      monthlyFee: 1450.499,
      currency: 'gbp',
      includes: ['Helpdesk', ' Patching '],
    };
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 1)]);
    const technician = async () => {
      const session = await api()
        .post('/auth/sign-in')
        .send({ email: TECHNICIAN_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
      return `Bearer ${session.body.token}`;
    };

    it('keeps the contract someone enters, which only admins change', async () => {
      const original = clientSchema.parse(
        (await as.get(`/clients/${id}`).expect(200)).body,
      ).contract!;
      const saved = await as
        .put(`/clients/${id}/contract`)
        .send(contract)
        .expect(200);
      expect(saved.body.contract).toEqual({
        plan: 'Managed Plus',
        startedOn: '2026-04-01',
        renewsOn: '2028-03-31',
        monthlyFee: 1450.5,
        currency: 'GBP',
        includes: ['Helpdesk', 'Patching'],
      });
      expect(
        (await as.get(`/clients/${id}`).expect(200)).body.contract,
      ).toEqual(saved.body.contract);

      const backwards = await as
        .put(`/clients/${id}/contract`)
        .send({ ...contract, renewsOn: '2025-01-01' })
        .expect(400);
      expect(backwards.body.errors[0]).toEqual({
        path: 'renewsOn',
        message: 'It can’t renew before it starts',
      });
      await as
        .put(`/clients/${id}/contract`)
        .send({ ...contract, currency: 'pounds' })
        .expect(400);
      await as
        .put('/clients/no-such-client/contract')
        .send(contract)
        .expect(404);

      const bearer = await technician();
      await api()
        .put(`/clients/${id}/contract`)
        .set('Authorization', bearer)
        .send(contract)
        .expect(403);
      await api()
        .delete(`/clients/${id}/contract`)
        .set('Authorization', bearer)
        .expect(403);

      const cleared = await as.delete(`/clients/${id}/contract`).expect(200);
      expect(cleared.body.contract).toBeNull();
      await as.put(`/clients/${id}/contract`).send(original).expect(200);
      const changes = auditPageSchema.parse(
        (await as.get(`/audit?kind=change&clientId=${id}&limit=10`).expect(200))
          .body,
      ).data;
      // Entries written in the same millisecond have no order between them.
      expect(changes.map((e) => e.what)).toEqual(
        expect.arrayContaining([
          'Changed the contract: Managed Plus, 1450.5 GBP a month, renewing 2028-03-31',
          'Removed the contract’s terms',
          `Added the contract: ${original.plan}, ${original.monthlyFee} ${original.currency} a month, renewing ${original.renewsOn}`,
        ]),
      );
    });

    it('keeps the files that go with it', async () => {
      const url = `/clients/${id}/contract/documents`;
      await as.get(url).expect(200).expect({ data: [] });
      const added = await as
        .post(`${url}?name=${encodeURIComponent('Signed contract – 2026.pdf')}`)
        .set('content-type', 'application/pdf')
        .send(pdf)
        .expect(201);
      expect(added.body).toMatchObject({
        clientId: id,
        name: 'Signed contract – 2026.pdf',
        contentType: 'application/pdf',
        size: pdf.length,
        uploadedBy: { name: 'Sam Okafor' },
      });
      const list = await as.get(url).expect(200);
      expect(list.body.data).toEqual([added.body]);

      // Everyone can open it; it opens in the browser and runs nothing.
      const bearer = await technician();
      const file = await api()
        .get(`${url}/${added.body.id}`)
        .set('Authorization', bearer)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, pdf)).toBe(0);
      expect(file.headers).toMatchObject({
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="Signed contract _ 2026.pdf"; filename*=UTF-8''Signed%20contract%20%E2%80%93%202026.pdf`,
        'x-content-type-options': 'nosniff',
        'content-security-policy': 'sandbox',
      });
      await api()
        .post(url)
        .set('Authorization', bearer)
        .set('content-type', 'application/pdf')
        .send(pdf)
        .expect(403);
      await api()
        .delete(`${url}/${added.body.id}`)
        .set('Authorization', bearer)
        .expect(403);

      const renamed = await as
        .post(`${url}?name=contract.docx`)
        .set(
          'content-type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        .send(pdf)
        .expect(415);
      expect(renamed.body.message).toBe(
        'That file isn’t the Word file it says it is.',
      );
      await as
        .post(url)
        .set('content-type', 'text/html')
        .send('<script>alert(1)</script>')
        .expect(415);
      const big = await as
        .post(url)
        .set('content-type', 'application/pdf')
        .send(Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]))
        .expect(413);
      expect(big.body.message).toBe('Keep each file under 10 MB.');
      // Another client's address doesn't reach it.
      await as
        .get(`/clients/harbour-dental/contract/documents/${added.body.id}`)
        .expect(404);
      await as.get('/clients/no-such-client/contract/documents').expect(404);

      await as.delete(`${url}/${added.body.id}`).expect(204);
      await as.delete(`${url}/${added.body.id}`).expect(404);
      await as.get(`${url}/${added.body.id}`).expect(404);
      const changes = auditPageSchema.parse(
        (await as.get(`/audit?kind=change&clientId=${id}&limit=10`).expect(200))
          .body,
      ).data;
      expect(changes.map((e) => e.what)).toEqual(
        expect.arrayContaining([
          'Added “Signed contract – 2026.pdf” to the contract',
          'Removed “Signed contract – 2026.pdf” from the contract',
        ]),
      );
    });
  });
});
