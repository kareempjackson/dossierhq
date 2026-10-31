import {
  auditPageSchema,
  meSchema,
  onboardingSchema,
  twoFactorEnabledSchema,
  twoFactorSetupSchema,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { DEMO_EMAIL, DEMO_PASSWORD, demo } from '@dossierhq/fixtures';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashToken } from '../src/auth/auth.service.js';
import { base32Decode, hotp, stepAt } from '../src/auth/totp.js';
import { DATABASE } from '../src/database/database.module.js';
import { MAILER, type LogMailer } from '../src/mail/mailer.js';
import { BROWSER_KEY, confirmedSignUp, signUpLink } from './accounts.js';

/** The app's code for a secret at a step from now (0 = this one). */
const codeFor = (secret: string, offset = 0) =>
  hotp(base32Decode(secret), stepAt(Date.now()) + offset);

// Signing up by email, confirming it, and onboarding, over HTTP on the
// in-memory adapter holding the demo workspace (see vitest.config.e2e.ts).
describe('Sign-up and onboarding (e2e)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const outbox = () => (app.get(MAILER) as LogMailer).outbox;
  const mailsTo = (email: string) =>
    outbox().filter((m) => m.to.includes(email));
  const db = () => app.get<DatabaseAdapter>(DATABASE);
  const bearer = (token: string) => (r: request.Test) =>
    r.set('Authorization', `Bearer ${token}`);
  /** Waits for background email to settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(createMemoryAdapter(demo))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('signing up', () => {
    it('emails a link, and makes no account until it’s opened', async () => {
      const email = 'rae.kim@kestrel-networks.example';
      const password = 'rae’s long password';
      await api()
        .post('/auth/sign-up')
        .send({ email: 'Rae.Kim@Kestrel-Networks.example', password })
        .expect(202)
        .expect({});
      const token = await signUpLink(app, email);
      const mail = mailsTo(email).at(-1)!;
      expect(mail.subject).toBe('Confirm your email for Dossier');
      expect(mail.text).toContain('https://dossier.test/verify-email?token=');
      await expect(db().users.findByEmail(email)).resolves.toBeNull();

      // Signing in with the right password says what's missing; a wrong one
      // says no more than for any other email.
      await api()
        .post('/auth/sign-in')
        .send({ email, password })
        .expect(200)
        .expect({ emailUnconfirmed: true });
      await api()
        .post('/auth/sign-in')
        .send({ email, password: 'not rae’s password' })
        .expect(401);

      // Away from the browser that signed up, the password comes first.
      await api()
        .post('/auth/sign-up/confirm')
        .send({ token })
        .expect(200)
        .expect({ passwordRequired: true });
      await api()
        .post('/auth/sign-up/confirm')
        .send({ token, browserKey: 'b'.repeat(40), password: 'wrong one!' })
        .expect(401);
      const { body } = await api()
        .post('/auth/sign-up/confirm')
        .send({ token, password })
        .expect(200);
      expect(meSchema.parse(body.me)).toMatchObject({
        user: { name: 'Rae Kim', email, title: '' },
        workspace: { name: 'Kestrel Networks', timeZone: 'UTC' },
        role: 'owner',
        setup: 'onboarding',
      });

      // The link works once.
      const again = await api()
        .post('/auth/sign-up/confirm')
        .send({ token, password })
        .expect(400);
      expect(again.body.message).toBe(
        'This link has expired or was already used. Sign in, or sign up again for a new one.',
      );
    });

    it('needs no password in the browser that signed up, and keeps its time zone', async () => {
      const email = 'ana@gmail.com';
      await api()
        .post('/auth/sign-up')
        .send({
          email,
          password: 'ana’s long password',
          timeZone: 'Asia/Tokyo',
          browserKey: BROWSER_KEY,
        })
        .expect(202);
      const token = await signUpLink(app, email);
      const { body } = await api()
        .post('/auth/sign-up/confirm')
        .send({ token, browserKey: BROWSER_KEY })
        .expect(200);
      expect(body.me).toMatchObject({
        user: { name: 'Ana' },
        workspace: { name: 'My workspace', timeZone: 'Asia/Tokyo' },
      });
    });

    it('sends a new link that replaces the last, on request or with a reset', async () => {
      const email = 'lee@resend.example';
      await api()
        .post('/auth/sign-up')
        .send({ email, password: 'lee’s long password' })
        .expect(202);
      const first = await signUpLink(app, email);
      await api().post('/auth/sign-up/resend').send({ email }).expect(202);
      await settle();
      const second = await signUpLink(app, email);
      expect(second).not.toBe(first);
      await expect(db().signUps.find(hashToken(first))).resolves.toBeNull();

      // Forgetting the password before confirming sends the link too.
      await api().post('/auth/password-reset').send({ email }).expect(202);
      await settle();
      const third = await signUpLink(app, email);
      expect(third).not.toBe(second);
      expect(mailsTo(email).map((m) => m.subject)).toEqual([
        'Confirm your email for Dossier',
        'Confirm your email for Dossier',
        'Confirm your email for Dossier',
      ]);
      // Three to one address in an hour is the most.
      await api().post('/auth/sign-up/resend').send({ email }).expect(429);

      // Resending for an email with nothing waiting sends nothing.
      await api()
        .post('/auth/sign-up/resend')
        .send({ email: 'nobody@resend.example' })
        .expect(202);
      await settle();
      expect(mailsTo('nobody@resend.example')).toEqual([]);
    });

    it('tells an email that has an account so, and makes no other', async () => {
      await api()
        .post('/auth/sign-up')
        .send({ email: DEMO_EMAIL.toUpperCase(), password: 'someone else’s!' })
        .expect(202)
        .expect({});
      await settle();
      const mail = mailsTo(DEMO_EMAIL).at(-1)!;
      expect(mail.subject).toBe('You already have a Dossier account');
      expect(mail.text).toContain('https://dossier.test/forgot-password');
      expect(mail.text).not.toContain('verify-email');
      await expect(db().signUps.findByEmail(DEMO_EMAIL)).resolves.toBeNull();
      await api()
        .post('/auth/sign-in')
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
    });

    it('refuses an expired link', async () => {
      await db().signUps.save({
        tokenHash: hashToken('an-expired-sign-up-link'),
        email: 'late@expired.example',
        passwordHash: 'unused',
        browserHash: hashToken(BROWSER_KEY),
        timeZone: 'UTC',
        createdAt: '2020-01-01T00:00:00.000Z',
        expiresAt: '2020-01-02T00:00:00.000Z',
      });
      await api()
        .post('/auth/sign-up/confirm')
        .send({ token: 'an-expired-sign-up-link', browserKey: BROWSER_KEY })
        .expect(400);
    });

    it('turns down a weak password before sending anything', async () => {
      const refused = await api()
        .post('/auth/sign-up')
        .send({ email: 'weak@example.com', password: 'short' })
        .expect(400);
      expect(refused.body.errors[0].message).toBe('Use at least 12 characters');
    });
  });

  describe('onboarding', () => {
    it('keeps a new owner to onboarding until two-factor is on', async () => {
      const email = 'sky@northwind.example';
      const password = 'sky’s long password';
      const session = await confirmedSignUp(app, { email, password });
      const as = bearer(session.token);

      // Only what onboarding needs answers until it's finished.
      const refused = await as(api().get('/clients')).expect(403);
      expect(refused.body).toMatchObject({
        message: 'Finish setting up your account first.',
        setupNeeded: true,
      });
      await as(api().get('/connectors')).expect(403);
      await as(api().get('/auth/me')).expect(200);
      await as(api().get('/report-settings')).expect(200);
      await as(api().get('/members/invites')).expect(200);

      expect(
        onboardingSchema.parse((await as(api().get('/onboarding'))).body),
      ).toEqual({
        profile: { name: 'Sky', title: '' },
        suggestedWebsite: 'northwind.example',
        company: {
          name: 'Northwind',
          timeZone: 'UTC',
          website: null,
          clientCount: null,
          teamSize: null,
          tools: [],
          otherTools: '',
        },
      });

      await as(api().put('/onboarding/profile'))
        .send({ name: '', title: 'Owner' })
        .expect(400);
      await as(api().put('/onboarding/profile'))
        .send({ name: 'Sky Doe', title: 'Owner' })
        .expect(200);
      await as(api().put('/onboarding/company'))
        .send({ website: 'not a website' })
        .expect(400);
      await as(api().put('/onboarding/company'))
        .send({
          name: 'Northwind IT',
          timeZone: 'Europe/London',
          website: 'https://www.Northwind.example/about',
          clientCount: '26-50',
          teamSize: '6-15',
        })
        .expect(200);
      const saved = await as(api().put('/onboarding/company'))
        .send({ tools: ['hudu', 'ninjaone', 'hudu'], otherTools: 'IT Glue' })
        .expect(200);
      expect(saved.body).toEqual({
        profile: { name: 'Sky Doe', title: 'Owner' },
        suggestedWebsite: 'northwind.example',
        company: {
          name: 'Northwind IT',
          timeZone: 'Europe/London',
          website: 'northwind.example',
          clientCount: '26-50',
          teamSize: '6-15',
          tools: ['hudu', 'ninjaone'],
          otherTools: 'IT Glue',
        },
      });

      // Branding and invites are part of onboarding too.
      await as(api().put('/report-settings'))
        .send({
          senderName: 'Northwind IT',
          replyTo: '',
          brandColour: '#0b7a5a',
          draftAt: null,
          sendAt: null,
        })
        .expect(200);
      await as(api().post('/members/invites'))
        .send({ email: 'tech@northwind.example', role: 'technician' })
        .expect(201);

      const early = await as(api().post('/onboarding/finish')).expect(409);
      expect(early.body.message).toBe('Turn on two-factor sign-in first.');

      const setup = twoFactorSetupSchema.parse(
        (await as(api().post('/auth/two-factor/setup')).expect(200)).body,
      );
      twoFactorEnabledSchema.parse(
        (
          await as(api().post('/auth/two-factor/enable'))
            .send({ code: codeFor(setup.secret) })
            .expect(200)
        ).body,
      );
      const finished = await as(api().post('/onboarding/finish')).expect(200);
      expect(finished.body).toMatchObject({
        user: { name: 'Sky Doe', title: 'Owner' },
        workspace: { name: 'Northwind IT', timeZone: 'Europe/London' },
        setup: 'done',
      });
      await as(api().get('/clients')).expect(200);
      // Finishing again changes nothing.
      await as(api().post('/onboarding/finish')).expect(200);

      const { data } = auditPageSchema.parse(
        (await as(api().get('/audit?kind=sign-in'))).body,
      );
      // Entries in the same millisecond have no set order.
      expect(data.map((e) => e.what).sort()).toEqual([
        'Confirmed their email, created the workspace and signed in',
        'Finished setting up their account',
        'Turned on two-factor sign-in',
      ]);

      // From now on two-factor stays on: turning it off sends them back.
      expect(
        (await as(api().get('/auth/two-factor')).expect(200)).body,
      ).toMatchObject({ enabled: true, required: true });
      await as(api().post('/auth/two-factor/disable'))
        .send({ code: codeFor(setup.secret, 1) })
        .expect(204);
      expect((await as(api().get('/auth/me'))).body.setup).toBe('two-factor');
      await as(api().get('/clients')).expect(403);
      await as(api().post('/onboarding/finish')).expect(409);
      const again = twoFactorSetupSchema.parse(
        (await as(api().post('/auth/two-factor/setup')).expect(200)).body,
      );
      await as(api().post('/auth/two-factor/enable'))
        .send({ code: codeFor(again.secret) })
        .expect(200);
      expect((await as(api().get('/auth/me'))).body.setup).toBe('done');
      await as(api().get('/clients')).expect(200);

      // And signing in asks for a code.
      await api()
        .post('/auth/sign-in')
        .send({ email, password })
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({ twoFactorRequired: true });
        });
    });

    it('gives someone who joins by invite a shorter onboarding', async () => {
      const owner = (
        await api()
          .post('/auth/sign-in')
          .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
          .expect(200)
      ).body.token as string;
      const email = 'jo.park@larkspur-it.example';
      await bearer(owner)(api().post('/members/invites'))
        .send({ email, role: 'technician' })
        .expect(201);
      const invite = mailsTo(email).at(-1)!;
      const token = /\/invite\?token=([\w-]+)/.exec(invite.text)![1]!;

      // Only a password: onboarding asks for the rest.
      const { body } = await api()
        .post('/auth/invites/accept')
        .send({ token, password: 'jo’s long password' })
        .expect(200);
      expect(body.me).toMatchObject({
        user: { name: 'Jo Park', email },
        role: 'technician',
        setup: 'onboarding',
      });
      const as = bearer(body.token);
      await as(api().get('/clients')).expect(403);
      await as(api().put('/onboarding/profile'))
        .send({ name: 'Jo Park', title: 'Technician' })
        .expect(200);
      // The company is the owner's to describe.
      await as(api().put('/onboarding/company'))
        .send({ name: 'Mine now' })
        .expect(403);
      await as(api().post('/onboarding/finish')).expect(409);
      const setup = twoFactorSetupSchema.parse(
        (await as(api().post('/auth/two-factor/setup')).expect(200)).body,
      );
      await as(api().post('/auth/two-factor/enable'))
        .send({ code: codeFor(setup.secret) })
        .expect(200);
      await as(api().post('/onboarding/finish')).expect(200);
      await as(api().get('/clients')).expect(200);
    });

    it('leaves accounts from before onboarding as they were', async () => {
      const { body } = await api()
        .post('/auth/sign-in')
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
        .expect(200);
      expect(body.me.setup).toBe('done');
      expect(
        (await bearer(body.token)(api().get('/auth/two-factor'))).body,
      ).toMatchObject({ enabled: false, required: false });
    });
  });
});
