import { meSchema, type SignInResponse } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DATABASE } from '../src/database/database.module.js';
import { MAILER, type LogMailer } from '../src/mail/mailer.js';

/** What the web app keeps in the browser that signs up. */
export const BROWSER_KEY = 'a-browser-key-at-least-32-characters-long';

/**
 * The token in the newest sign-up link emailed to `email`, once it arrives.
 * It goes after the password is hashed, which takes a while on purpose, and
 * longer with every suite running at once.
 */
export async function signUpLink(
  app: INestApplication,
  email: string,
): Promise<string> {
  const outbox = () => (app.get(MAILER) as LogMailer).outbox;
  for (let i = 0; i < 500; i++) {
    const mail = outbox().findLast((m) => m.to.includes(email.toLowerCase()));
    const token = mail && /verify-email\?token=([\w-]+)/.exec(mail.text);
    if (token) return token[1]!;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No sign-up link reached ${email}`);
}

/**
 * Signs up and opens the link in the same browser: the new owner's session,
 * before onboarding.
 */
export async function confirmedSignUp(
  app: INestApplication,
  { email, password }: { email: string; password: string },
): Promise<SignInResponse> {
  const api = () => request(app.getHttpServer());
  await api()
    .post('/auth/sign-up')
    .send({ email, password, timeZone: 'UTC', browserKey: BROWSER_KEY })
    .expect(202);
  const token = await signUpLink(app, email);
  const { body } = await api()
    .post('/auth/sign-up/confirm')
    .send({ token, browserKey: BROWSER_KEY })
    .expect(200);
  return body as SignInResponse;
}

/**
 * Marks someone as having finished onboarding without two-factor, like an
 * account from before onboarding existed. For suites about something else;
 * onboarding.e2e-spec.ts goes through it for real.
 */
export async function skipOnboarding(
  app: INestApplication,
  userId: string,
): Promise<void> {
  const db = app.get<DatabaseAdapter>(DATABASE);
  await db.users.finishOnboarding(userId, new Date().toISOString(), false);
}

/**
 * A new workspace named `workspaceName`, its owner signed in and set up as
 * given, past onboarding (see skipOnboarding).
 */
export async function signUpWorkspace(
  app: INestApplication,
  {
    workspaceName,
    timeZone = 'UTC',
    name,
    title = '',
    email,
    password,
  }: {
    workspaceName: string;
    timeZone?: string;
    name: string;
    title?: string;
    email: string;
    password: string;
  },
): Promise<SignInResponse> {
  const session = await confirmedSignUp(app, { email, password });
  const as = (r: request.Test) =>
    r.set('Authorization', `Bearer ${session.token}`);
  const api = () => request(app.getHttpServer());
  await as(api().put('/onboarding/profile')).send({ name, title }).expect(200);
  await as(api().put('/onboarding/company'))
    .send({ name: workspaceName, timeZone })
    .expect(200);
  await skipOnboarding(app, session.me.user.id);
  const me = meSchema.parse((await as(api().get('/auth/me')).expect(200)).body);
  return { ...session, me };
}
