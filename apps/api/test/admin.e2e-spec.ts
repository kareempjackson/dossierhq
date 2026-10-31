import {
  auditPageSchema,
  meSchema,
  supportGrantSchema,
  supportOpenedSchema,
  supportSessionSchema,
  platformPersonSchema,
  staffAuditPageSchema,
  staffInviteAcceptedSchema,
  staffListSchema,
  staffMeSchema,
  staffSessionSchema,
  staffTwoFactorSetupSchema,
  workspaceDetailSchema,
  workspacePageSchema,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { DEMO_EMAIL, DEMO_PASSWORD, demo } from '@dossierhq/fixtures';
import type { INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IS_STAFF } from '../src/admin/staff.decorator.js';
import { createStaffInvite } from '../src/admin/staff-invites.js';
import { AppModule } from '../src/app.module.js';
import { SupportAccess } from '../src/auth/support-access.service.js';
import { hashToken } from '../src/auth/token-hash.js';
import { base32Decode, hotp, stepAt } from '../src/auth/totp.js';
import { DATABASE } from '../src/database/database.module.js';
import { MAILER, type LogMailer } from '../src/mail/mailer.js';
import { E2E_ADMIN_API_KEY } from './fake-tools.js';

const KEY = 'x-dossier-admin-key';
const PASSWORD = 'a staff password, long enough';

/** A code from an authenticator app holding `secret`, `ahead` steps from now. */
const codeFor = (secret: string, ahead = 0) =>
  hotp(base32Decode(secret), stepAt(Date.now()) + ahead);

// The admin app's API: staff accounts, apart from workspaces' sign-in.
describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let db: DatabaseAdapter;
  let customer = '';
  const api = () => request(app.getHttpServer());
  /** Requests as the admin app makes them: with its key, and a staff session. */
  const admin = (token?: string) => {
    const signed = <T extends request.Test>(test: T) => {
      test.set(KEY, E2E_ADMIN_API_KEY);
      if (token) test.set('Authorization', `Bearer ${token}`);
      return test;
    };
    return {
      get: (url: string) => signed(api().get(url)),
      post: (url: string) => signed(api().post(url)),
      patch: (url: string) => signed(api().patch(url)),
      delete: (url: string) => signed(api().delete(url)),
    };
  };

  /** Accepts an invite as the admin app does, returning the session and secret. */
  async function join(token: string, name: string) {
    const setup = staffTwoFactorSetupSchema.parse(
      (
        await admin()
          .post('/admin/auth/invites/setup')
          .send({ token })
          .expect(200)
      ).body,
    );
    const accepted = staffInviteAcceptedSchema.parse(
      (
        await admin()
          .post('/admin/auth/invites/accept')
          .send({
            token,
            name,
            password: PASSWORD,
            sealed: setup.sealed,
            code: codeFor(setup.secret),
          })
          .expect(201)
      ).body,
    );
    return { ...accepted, secret: setup.secret };
  }

  let first: Awaited<ReturnType<typeof join>>;

  beforeAll(async () => {
    db = createMemoryAdapter(demo);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE)
      .useValue(db)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    customer = (
      await api()
        .post('/auth/sign-in')
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
        .expect(200)
    ).body.token;
    // The first member of staff comes from the command line.
    const { token } = await createStaffInvite(db, {
      email: 'Ada@Dossier.example',
      role: 'admin',
      from: null,
    });
    first = await join(token, 'Ada Admin');
  });

  afterAll(async () => {
    await app.close();
  });

  it('marks every /admin controller as staff-only', () => {
    const paths: string[] = [];
    for (const module of app.get(ModulesContainer).values()) {
      for (const { metatype } of module.controllers.values()) {
        if (!metatype) continue;
        const path = String(Reflect.getMetadata(PATH_METADATA, metatype));
        if (!path.replace(/^\//, '').startsWith('admin')) continue;
        paths.push(path);
        expect(
          Reflect.getMetadata(IS_STAFF, metatype),
          `${path} is missing @Staff()`,
        ).toBe(true);
      }
    }
    expect(paths).toEqual(
      expect.arrayContaining(['admin/auth', 'admin/staff', 'admin/activity']),
    );
  });

  it('hides /admin without the admin app’s key', async () => {
    const res = await api()
      .get('/admin/staff')
      .set('Authorization', `Bearer ${first.token}`)
      .expect(404);
    expect(res.body.message).toBe('Cannot GET /admin/staff');
    await api()
      .post('/admin/auth/sign-in')
      .set(KEY, 'not-the-key-but-just-as-long-as-it')
      .send({ email: 'ada@dossier.example', password: PASSWORD })
      .expect(404);
  });

  it('keeps staff and workspace sessions apart', async () => {
    await admin().get('/admin/staff').expect(401);
    await admin(customer).get('/admin/staff').expect(401);
    await api()
      .get('/clients')
      .set('Authorization', `Bearer ${first.token}`)
      .expect(401);
    await admin(first.token).get('/admin/staff').expect(200);
  });

  it('joins from an invite with two-factor already on', async () => {
    expect(first.me.staff).toMatchObject({
      email: 'ada@dossier.example',
      name: 'Ada Admin',
      role: 'admin',
      disabledAt: null,
    });
    expect(first.recoveryCodes).toHaveLength(10);
    expect(first.me.recoveryCodesLeft).toBe(10);
  });

  it('refuses an invite whose first code is wrong, or used', async () => {
    const { token } = await createStaffInvite(db, {
      email: 'wrong@dossier.example',
      role: 'support',
      from: null,
    });
    await admin()
      .post('/admin/auth/invites/preview')
      .send({ token })
      .expect(200, {
        email: 'wrong@dossier.example',
        role: 'support',
        invitedBy: 'Dossier',
      });
    const setup = (
      await admin().post('/admin/auth/invites/setup').send({ token })
    ).body;
    const accept = (code: string, sealed = setup.sealed) =>
      admin().post('/admin/auth/invites/accept').send({
        token,
        name: 'Wren',
        password: PASSWORD,
        sealed,
        code,
      });
    const wrong = codeFor(setup.secret) === '000000' ? '111111' : '000000';
    await accept(wrong).expect(400);
    // A secret from another invite's setup doesn't fit this one.
    const other = await createStaffInvite(db, {
      email: 'other@dossier.example',
      role: 'support',
      from: null,
    });
    const otherSetup = (
      await admin()
        .post('/admin/auth/invites/setup')
        .send({ token: other.token })
    ).body;
    await accept(codeFor(otherSetup.secret), otherSetup.sealed).expect(400);
    await accept(codeFor(setup.secret)).expect(201);
    await accept(codeFor(setup.secret)).expect(400);
  });

  it('signs in with a password and then a code', async () => {
    await admin()
      .post('/admin/auth/sign-in')
      .send({ email: 'ada@dossier.example', password: 'not the password' })
      .expect(401);
    const signIn = async () =>
      (
        await admin()
          .post('/admin/auth/sign-in')
          .send({ email: 'ADA@dossier.example', password: PASSWORD })
          .expect(200)
      ).body.challenge as string;

    // The code used to join is spent; the next one works, once.
    const challenge = await signIn();
    await admin()
      .post('/admin/auth/sign-in/two-factor')
      .send({ challenge, code: codeFor(first.secret) })
      .expect(401);
    const session = staffSessionSchema.parse(
      (
        await admin()
          .post('/admin/auth/sign-in/two-factor')
          .send({ challenge, code: codeFor(first.secret, 1) })
          .expect(200)
      ).body,
    );
    expect(session.me.staff.email).toBe('ada@dossier.example');

    // A recovery code works once. (Each challenge is asked for before the
    // next request starts: supertest closes the server between requests.)
    const recovery = first.recoveryCodes[0]!;
    for (const status of [200, 401]) {
      const next = await signIn();
      await admin()
        .post('/admin/auth/sign-in/two-factor')
        .send({ challenge: next, code: recovery })
        .expect(status);
    }
    const me = staffMeSchema.parse(
      (await admin(session.token).get('/admin/auth/me').expect(200)).body,
    );
    expect(me.recoveryCodesLeft).toBe(9);

    await admin(session.token).post('/admin/auth/sign-out').expect(204);
    await admin(session.token).get('/admin/auth/me').expect(401);
  });

  it('lets admins manage staff, and support only look', async () => {
    const as = admin(first.token);
    await as
      .post('/admin/staff/invites')
      .send({ email: 'Sam@Dossier.example', role: 'support' })
      .expect(201);
    const mail = (app.get(MAILER) as LogMailer).outbox.at(-1)!;
    expect(mail.to).toEqual(['sam@dossier.example']);
    const link = /https:\/\/admin\.dossier\.test\/invite\?token=(\S+)/.exec(
      mail.text,
    );
    expect(link).not.toBeNull();
    const sam = await join(decodeURIComponent(link![1]!), 'Sam Support');
    expect(sam.me.staff.role).toBe('support');

    const list = staffListSchema.parse(
      (await admin(sam.token).get('/admin/staff').expect(200)).body,
    );
    expect(list.data.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Ada Admin', 'Sam Support']),
    );
    expect(list.invites.map((i) => i.email)).not.toContain(
      'sam@dossier.example',
    );
    const refused = await admin(sam.token)
      .post('/admin/staff/invites')
      .send({ email: 'x@dossier.example', role: 'admin' })
      .expect(403);
    expect(refused.body.message).toBe('Only admins can manage staff.');

    // There's always an admin, and nobody takes away their own access.
    await as
      .patch(`/admin/staff/${first.me.staff.id}`)
      .send({ role: 'support' })
      .expect(409);
    await as.delete(`/admin/staff/${first.me.staff.id}`).expect(403);

    await as
      .patch(`/admin/staff/${sam.me.staff.id}`)
      .send({ role: 'admin' })
      .expect(200);
    await admin(sam.token)
      .post('/admin/staff/invites')
      .send({ email: 'x@dossier.example', role: 'support' })
      .expect(201);
    await as.delete(`/admin/staff/${sam.me.staff.id}`).expect(204);
    await admin(sam.token).get('/admin/staff').expect(401);
    await admin()
      .post('/admin/auth/sign-in')
      .send({ email: 'sam@dossier.example', password: PASSWORD })
      .expect(401);
  });

  it('logs what staff did', async () => {
    const page = staffAuditPageSchema.parse(
      (
        await admin(first.token)
          .get('/admin/activity')
          .query({ limit: 50 })
          .expect(200)
      ).body,
    );
    const lines = page.data.map((e) => `${e.staff?.name ?? 'CLI'}: ${e.what}`);
    expect(lines).toEqual(
      expect.arrayContaining([
        'Ada Admin: Accepted the invite from Dossier and joined as admin',
        'Ada Admin: Sign-in failed: wrong password',
        'Ada Admin: Signed in',
        'Ada Admin: Signed in with a recovery code (9 left)',
        'Ada Admin: Invited sam@dossier.example to the staff as support',
        'Ada Admin: Made Sam Support an admin',
        'Ada Admin: Took away Sam Support’s access',
        'Sam Support: Invited x@dossier.example to the staff as support',
      ]),
    );
    const older = staffAuditPageSchema.parse(
      (
        await admin(first.token)
          .get('/admin/activity')
          .query({ limit: 2 })
          .expect(200)
      ).body,
    );
    expect(older.data).toHaveLength(2);
    expect(older.older).not.toBeNull();
  });
  describe('workspaces and people', () => {
    let support = '';
    const ws = demo.workspace.id;
    const signInAsDemo = () =>
      api()
        .post('/auth/sign-in')
        .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD });

    beforeAll(async () => {
      const { token } = await createStaffInvite(db, {
        email: 'sue@dossier.example',
        role: 'support',
        from: null,
      });
      support = (await join(token, 'Sue Support')).token;
    });

    it('lists and searches every workspace', async () => {
      const page = workspacePageSchema.parse(
        (await admin(support).get('/admin/workspaces').expect(200)).body,
      );
      const larkspur = page.data.find((w) => w.id === ws);
      expect(larkspur).toMatchObject({
        name: demo.workspace.name,
        suspension: null,
        owner: { email: DEMO_EMAIL },
        members: demo.memberships.length,
        clients: demo.clients.length,
        connectors: demo.connectors.length,
      });
      expect(page).toMatchObject({ page: 1, pageSize: 50 });

      const byEmail = workspacePageSchema.parse(
        (
          await admin(support)
            .get('/admin/workspaces')
            .query({ q: 'PRIYA@larkspur' })
            .expect(200)
        ).body,
      );
      expect(byEmail.data.map((w) => w.id)).toEqual([ws]);
      const none = workspacePageSchema.parse(
        (
          await admin(support)
            .get('/admin/workspaces')
            .query({ status: 'suspended' })
            .expect(200)
        ).body,
      );
      expect(none.data).toEqual([]);
    });

    it('shows one workspace in full, and its own audit log', async () => {
      const detail = workspaceDetailSchema.parse(
        (await admin(support).get(`/admin/workspaces/${ws}`).expect(200)).body,
      );
      expect(detail.members.map((m) => m.email)).toContain(DEMO_EMAIL);
      expect(detail.members.find((m) => m.email === DEMO_EMAIL)).toMatchObject({
        role: 'owner',
        workspace: { id: ws },
        twoFactor: false,
      });
      expect(detail.connectors).toHaveLength(demo.connectors.length);
      await admin(support).get('/admin/workspaces/nowhere').expect(404);

      const audit = auditPageSchema.parse(
        (
          await admin(support)
            .get(`/admin/workspaces/${ws}/audit`)
            .query({ kind: 'sign-in', limit: 5 })
            .expect(200)
        ).body,
      );
      expect(audit.data.length).toBeGreaterThan(0);
      expect(audit.data.every((e) => e.kind === 'sign-in')).toBe(true);
    });

    it('finds people by name or email', async () => {
      await admin(support).get('/admin/people').query({ q: 's' }).expect(400);
      const found = (
        await admin(support).get('/admin/people').query({ q: 'larkspur' })
      ).body.data.map((p: { email: string }) => p.email);
      expect(found).toEqual(
        expect.arrayContaining(demo.users.map((u) => u.email)),
      );
      const sam = demo.users.find((u) => u.email === DEMO_EMAIL)!;
      const person = platformPersonSchema.parse(
        (await admin(support).get(`/admin/people/${sam.id}`).expect(200)).body,
      );
      expect(person).toMatchObject({
        email: DEMO_EMAIL,
        workspace: { id: ws, name: demo.workspace.name },
        role: 'owner',
      });
    });

    it('lets only admins change workspaces and accounts', async () => {
      const sam = demo.users.find((u) => u.email === DEMO_EMAIL)!;
      const refused = await admin(support)
        .post(`/admin/workspaces/${ws}/suspend`)
        .send({ reason: 'Testing' })
        .expect(403);
      expect(refused.body.message).toBe('Only admins can suspend workspaces.');
      await admin(support).post(`/admin/workspaces/${ws}/restore`).expect(403);
      await admin(support)
        .delete(`/admin/workspaces/${ws}`)
        .send({ confirmName: demo.workspace.name })
        .expect(403);
      await admin(support).post(`/admin/people/${sam.id}/sign-out`).expect(403);
      await admin(support)
        .post(`/admin/people/${sam.id}/password-reset`)
        .expect(403);
      await admin(support)
        .delete(`/admin/people/${sam.id}/two-factor`)
        .expect(403);
    });

    it('suspends a workspace: nobody signs in, and nothing syncs', async () => {
      const before = (await signInAsDemo().expect(200)).body.token as string;
      await admin(first.token)
        .post(`/admin/workspaces/${ws}/suspend`)
        .send({ reason: '' })
        .expect(400);
      await admin(first.token)
        .post(`/admin/workspaces/${ws}/suspend`)
        .send({ reason: 'Unpaid since September' })
        .expect(204);
      await admin(first.token)
        .post(`/admin/workspaces/${ws}/suspend`)
        .send({ reason: 'Again' })
        .expect(409);

      await api()
        .get('/clients')
        .set('Authorization', `Bearer ${before}`)
        .expect(401);
      const refused = await signInAsDemo().expect(403);
      expect(refused.body).toMatchObject({ reason: 'suspended' });
      expect(await db.connectors.listAll()).not.toContainEqual(
        expect.objectContaining({ workspaceId: ws }),
      );

      // A session made despite it (a sign-in already under way) is refused.
      const sam = demo.users.find((u) => u.email === DEMO_EMAIL)!;
      const raced = 'raced-session-token';
      await db.sessions.create({
        tokenHash: hashToken(raced),
        userId: sam.id,
        workspaceId: ws,
        createdAt: new Date().toISOString(),
        expiresAt: '2999-01-01T00:00:00.000Z',
        lastSeenAt: new Date().toISOString(),
      });
      await api()
        .get('/clients')
        .set('Authorization', `Bearer ${raced}`)
        .expect(401);

      // Reset links aren't sent, and staff are told to restore first.
      const sent = (app.get(MAILER) as LogMailer).outbox.length;
      await api()
        .post('/auth/password-reset')
        .send({ email: DEMO_EMAIL })
        .expect(202);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect((app.get(MAILER) as LogMailer).outbox).toHaveLength(sent);
      await admin(first.token)
        .post(`/admin/people/${sam.id}/password-reset`)
        .expect(409);

      const summary = workspacePageSchema.parse(
        (
          await admin(support)
            .get('/admin/workspaces')
            .query({ status: 'suspended' })
            .expect(200)
        ).body,
      );
      expect(summary.data).toEqual([
        expect.objectContaining({
          id: ws,
          suspension: {
            at: expect.any(String),
            reason: 'Unpaid since September',
          },
        }),
      ]);

      // The workspace's own log says who, as Dossier support.
      const audit = auditPageSchema.parse(
        (
          await admin(support)
            .get(`/admin/workspaces/${ws}/audit`)
            .query({ kind: 'change', limit: 5 })
        ).body,
      );
      expect(audit.data[0]).toMatchObject({
        what: 'Suspended the workspace: Unpaid since September',
        actor: {
          userId: null,
          name: 'Dossier support (Ada Admin)',
          email: 'ada@dossier.example',
        },
      });
    });

    it('restores it, and refuses to delete one in use', async () => {
      await admin(first.token)
        .delete(`/admin/workspaces/${ws}`)
        .send({ confirmName: 'Larkspur' })
        .expect(400);
      await admin(first.token)
        .post(`/admin/workspaces/${ws}/restore`)
        .expect(204);
      await admin(first.token)
        .post(`/admin/workspaces/${ws}/restore`)
        .expect(409);
      await signInAsDemo().expect(200);
      expect(await db.connectors.listAll()).toContainEqual(
        expect.objectContaining({ workspaceId: ws }),
      );
      const refused = await admin(first.token)
        .delete(`/admin/workspaces/${ws}`)
        .send({ confirmName: demo.workspace.name })
        .expect(409);
      expect(refused.body.message).toMatch(/^Suspend the workspace/);
    });

    it('helps a person sign in again', async () => {
      const signUp = {
        workspaceName: 'Throwaway Co',
        timeZone: 'UTC',
        name: 'Tess Throw',
        email: 'tess@throwaway.example',
        password: 'long enough password',
      };
      const { body } = await api()
        .post('/auth/sign-up')
        .send(signUp)
        .expect(201);
      const tess = (test: request.Test) =>
        test.set('Authorization', `Bearer ${body.token}`);
      const setup = (
        await tess(api().post('/auth/two-factor/setup')).expect(200)
      ).body as { secret: string };
      await tess(api().post('/auth/two-factor/enable'))
        .send({ code: codeFor(setup.secret) })
        .expect(200);
      const userId = body.me.user.id as string;

      const as = admin(first.token);
      await as.delete(`/admin/people/${userId}/two-factor`).expect(204);
      await as.delete(`/admin/people/${userId}/two-factor`).expect(409);
      expect(
        (await as.get(`/admin/people/${userId}`).expect(200)).body,
      ).toMatchObject({ twoFactor: false, sessions: 1 });

      await as.post(`/admin/people/${userId}/sign-out`).expect(204);
      await tess(api().get('/clients')).expect(401);

      await as.post(`/admin/people/${userId}/password-reset`).expect(202);
      const mail = (app.get(MAILER) as LogMailer).outbox.at(-1)!;
      expect(mail.to).toEqual([signUp.email]);
      expect(mail.subject).toBe('Reset your Dossier password');

      const audit = auditPageSchema.parse(
        (
          await as
            .get(`/admin/workspaces/${body.me.workspace.id}/audit`)
            .query({ kind: 'sign-in' })
        ).body,
      );
      expect(audit.data.map((e) => `${e.actor?.name}: ${e.what}`)).toEqual(
        expect.arrayContaining([
          'Dossier support (Ada Admin): Turned off two-factor sign-in for Tess Throw',
          'Dossier support (Ada Admin): Signed Tess Throw out everywhere',
          'Dossier support (Ada Admin): Emailed Tess Throw a password reset link',
        ]),
      );
    });

    it('deletes a suspended workspace, freeing its people’s emails', async () => {
      const page = workspacePageSchema.parse(
        (
          await admin(first.token)
            .get('/admin/workspaces')
            .query({ q: 'throwaway' })
        ).body,
      );
      const throwaway = page.data[0]!;
      const as = admin(first.token);
      await as
        .post(`/admin/workspaces/${throwaway.id}/suspend`)
        .send({ reason: 'Asked to close their account' })
        .expect(204);
      await as
        .delete(`/admin/workspaces/${throwaway.id}`)
        .send({ confirmName: 'throwaway co' })
        .expect(400);
      await as
        .delete(`/admin/workspaces/${throwaway.id}`)
        .send({ confirmName: 'Throwaway Co' })
        .expect(204);
      await as.get(`/admin/workspaces/${throwaway.id}`).expect(404);
      await api()
        .post('/auth/sign-up')
        .send({
          workspaceName: 'Throwaway Again',
          timeZone: 'UTC',
          name: 'Tess Throw',
          email: 'tess@throwaway.example',
          password: 'long enough password',
        })
        .expect(201);

      const log = staffAuditPageSchema.parse(
        (
          await as
            .get('/admin/activity')
            .query({ workspaceId: throwaway.id })
            .expect(200)
        ).body,
      );
      expect(log.data.map((e) => e.what)).toEqual(
        expect.arrayContaining([
          'Deleted Throwaway Co (1 person, 0 clients)',
          'Suspended Throwaway Co: Asked to close their account',
        ]),
      );
    });
  });
  describe('support views', () => {
    let sue = '';
    const ws = demo.workspace.id;
    const sam = demo.users.find((u) => u.email === DEMO_EMAIL)!;
    /** Requests as the customer app makes them, with a support view's token. */
    const asView = (token: string) => ({
      get: (url: string) =>
        api().get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        api().post(url).set('Authorization', `Bearer ${token}`),
    });
    /** Opens a view as Sue, and its link; returns the grant and view token. */
    async function openView(reason = 'Their reports look empty', minutes = 15) {
      const opened = supportOpenedSchema.parse(
        (
          await admin(sue)
            .post(`/admin/workspaces/${ws}/support`)
            .send({ reason, minutes })
            .expect(201)
        ).body,
      );
      const token = new URL(opened.url).searchParams.get('token')!;
      const session = supportSessionSchema.parse(
        (await api().post('/auth/support/redeem').send({ token }).expect(200))
          .body,
      );
      return {
        grant: opened.grant,
        url: opened.url,
        link: token,
        view: session.token,
      };
    }

    beforeAll(async () => {
      const { token } = await createStaffInvite(db, {
        email: 'sue.views@dossier.example',
        role: 'support',
        from: null,
      });
      sue = (await join(token, 'Sue Support')).token;
    });

    it('opens a view once, from a link to the customer app', async () => {
      await admin(sue)
        .post(`/admin/workspaces/${ws}/support`)
        .send({ reason: 'Looking', minutes: 20 })
        .expect(400);
      await admin(sue)
        .post(`/admin/workspaces/${ws}/support`)
        .send({ reason: ' ', minutes: 15 })
        .expect(400);
      await admin(sue)
        .post('/admin/workspaces/nowhere/support')
        .send({ reason: 'Looking', minutes: 15 })
        .expect(404);

      const { url, link, view } = await openView();
      expect(url).toMatch(/^https:\/\/dossier\.test\/support\?token=/);
      expect(view.startsWith('sup.')).toBe(true);
      await api()
        .post('/auth/support/redeem')
        .send({ token: link })
        .expect(400);
    });

    it('reads as the owner, and changes nothing', async () => {
      const { view } = await openView();
      const me = meSchema.parse(
        (await asView(view).get('/auth/me').expect(200)).body,
      );
      expect(me).toMatchObject({
        user: { id: sam.id },
        role: 'owner',
        workspace: { id: ws },
        support: { staffName: 'Sue Support' },
      });
      await asView(view).get('/clients').expect(200);
      await asView(view).get('/audit').query({ kind: 'change' }).expect(200);

      const refused = await asView(view).post('/reports').send({}).expect(403);
      expect(refused.body.message).toBe('Support access is read-only.');
      await asView(view)
        .post(`/clients/${demo.clients[0]!.id}/views`)
        .expect(403);
      await api()
        .patch(`/recommendations/${demo.recommendations[0]!.id}`)
        .set('Authorization', `Bearer ${view}`)
        .send({ status: 'accepted' })
        .expect(403);
      // The owner's own account isn't the workspace's to show.
      await asView(view).get('/auth/sessions').expect(403);
      await asView(view).get('/auth/two-factor').expect(403);
      await asView(view).get('/notifications').expect(403);
      // A support token is no staff session, nor the other way round.
      await admin(view).get('/admin/staff').expect(401);
      await asView(sue).get('/clients').expect(401);
    });

    it('tells the workspace’s owners who looked, and why', async () => {
      // Suspending earlier ended the first session; sign in afresh.
      const owner = (
        await api()
          .post('/auth/sign-in')
          .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
          .expect(200)
      ).body.token as string;
      const audit = auditPageSchema.parse(
        (
          await api()
            .get('/audit')
            .set('Authorization', `Bearer ${owner}`)
            .query({ kind: 'sign-in', limit: 50 })
            .expect(200)
        ).body,
      );
      const lines = audit.data.map((e) => `${e.actor?.name}: ${e.what}`);
      expect(lines).toEqual(
        expect.arrayContaining([
          'Dossier support (Sue Support): Opened a read-only support view for 15 minutes: Their reports look empty',
          `Dossier support (Sue Support): Started the read-only support view, as ${sam.name}`,
        ]),
      );
      expect(
        audit.data.find(
          (e) => e.actor?.name === 'Dossier support (Sue Support)',
        )?.actor?.userId,
      ).toBeNull();
      // The owner's own session is untouched by any of it.
      await api()
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${owner}`)
        .expect(200);
    });

    it('ends from inside the view, or from the admin app', async () => {
      const inside = await openView('Checking a report');
      await asView(inside.view).post('/auth/sign-out').expect(204);
      await asView(inside.view).get('/clients').expect(401);

      const outside = await openView('Checking connections');
      const live = (await admin(first.token).get('/admin/support').expect(200))
        .body.data as { id: string }[];
      expect(live.map((g) => g.id)).toContain(outside.grant.id);
      expect(live.map((g) => g.id)).not.toContain(inside.grant.id);

      const ended = supportGrantSchema.parse(
        (
          await admin(first.token)
            .delete(`/admin/support/${outside.grant.id}`)
            .expect(200)
        ).body,
      );
      expect(ended).toMatchObject({ endedBy: 'Ada Admin' });
      await admin(first.token)
        .delete(`/admin/support/${outside.grant.id}`)
        .expect(409);
      await asView(outside.view).get('/clients').expect(401);

      const history = (
        await admin(sue).get(`/admin/workspaces/${ws}/support`).expect(200)
      ).body.data as {
        id: string;
        endedBy: string | null;
        openedAt: string | null;
      }[];
      expect(history.find((g) => g.id === inside.grant.id)).toMatchObject({
        endedBy: 'Sue Support',
        openedAt: expect.any(String),
      });

      const log = staffAuditPageSchema.parse(
        (
          await admin(first.token)
            .get('/admin/activity')
            .query({ workspaceId: ws })
        ).body,
      );
      expect(log.data.map((e) => `${e.staff?.name}: ${e.what}`)).toEqual(
        expect.arrayContaining([
          'Sue Support: Opened a 15-minute support view of Larkspur IT: Checking connections',
          'Ada Admin: Ended Sue Support’s support view of Larkspur IT',
        ]),
      );
    });

    it('ends when its time runs out, and a stale link never opens', async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const view = 'expired-view-session';
      await db.supportGrants.create({
        id: 'sup-expired',
        workspaceId: ws,
        workspaceName: demo.workspace.name,
        staff: { name: 'Sue Support', email: 'sue.views@dossier.example' },
        reason: 'Old',
        createdAt: past,
        expiresAt: past,
        openedAt: past,
        endedAt: null,
        endedBy: null,
        staffId: null,
        actingUserId: sam.id,
        handoffHash: hashToken('stale-link'),
        handoffExpiresAt: past,
        sessionHash: hashToken(view),
      });
      await asView(`sup.${view}`).get('/clients').expect(401);
      await api()
        .post('/auth/support/redeem')
        .send({ token: 'stale-link' })
        .expect(400);
      await (
        app.get(SupportAccess) as unknown as { sweep(): Promise<void> }
      ).sweep();
      await expect(db.supportGrants.get('sup-expired')).resolves.toMatchObject({
        endedBy: 'Its time ran out',
      });
    });

    it('still opens a suspended workspace, to find out why', async () => {
      await admin(first.token)
        .post(`/admin/workspaces/${ws}/suspend`)
        .send({ reason: 'Checking a complaint' })
        .expect(204);
      try {
        const { view } = await openView('Seeing what they see');
        await asView(view).get('/clients').expect(200);
      } finally {
        await admin(first.token)
          .post(`/admin/workspaces/${ws}/restore`)
          .expect(204);
      }
    });
  });
});
