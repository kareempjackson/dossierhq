import type {
  AccountSetupState,
  InviteAccept,
  InvitePreview,
  Me,
  PasswordResetConfirm,
  PasswordResetStep,
  Sessions,
  SignInRequest,
  SignInResponse,
  SignInStep,
  SignUpConfirm,
  SignUpConfirmStep,
  SignUpRequest,
  TwoFactorChallenge,
  TwoFactorSignIn,
  User,
  WorkspaceRole,
} from '@dossierhq/contracts';
import type {
  DatabaseAdapter,
  SessionRecord,
  SignUpRecord,
} from '@dossierhq/database';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AuditLog } from '../audit/audit-log.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { EventBus } from '../events/event-bus.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { hashPassword, verifyPassword } from './password.js';
import { roleIn } from './roles.js';
import { LIMITS, RateLimits } from './rate-limits.js';
import { nameFromEmail, workspaceNameFromEmail } from './sign-up-names.js';
import { hashToken } from './token-hash.js';
import { TwoFactorService } from './two-factor.service.js';

export { hashToken } from './token-hash.js';

/** How long a reset link works. */
export const RESET_MINUTES = 60;

/** 403 for a workspace staff have suspended; the web app knows it by `reason`. */
export const workspaceSuspended = () =>
  new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    message: 'This workspace is suspended. Contact Dossier support.',
    reason: 'suspended',
  });

/** How long a sign-up's link works. */
export const SIGN_UP_HOURS = 24;

const usedSignUpLink = () =>
  new BadRequestException(
    'This link has expired or was already used. Sign in, or sign up again for a new one.',
  );

const unusableInvite = () =>
  new BadRequestException(
    'This invite has expired, was withdrawn, or was already used. Ask whoever invited you for a new one.',
  );

/** How often a session's last use is written: often enough for idle timeouts. */
const TOUCH_EVERY_MS = 5 * 60_000;
/** How often ended sessions are deleted. */
const SWEEP_EVERY_MS = 60 * 60_000;

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionDays: number;
  private readonly idleHours: number;
  private readonly webUrl: string;
  private sweeper: NodeJS.Timeout | undefined;
  /** Compared against when the email is unknown, so timing doesn't reveal it. */
  private readonly dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly audit: AuditLog,
    private readonly events: EventBus,
    private readonly limits: RateLimits,
    private readonly twoFactor: TwoFactorService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.sessionDays = config.get('SESSION_DAYS', { infer: true });
    this.idleHours = config.get('SESSION_IDLE_HOURS', { infer: true });
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  onModuleInit() {
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  /** Deletes sessions that expired or went unused, which no request will. */
  private async sweep() {
    try {
      const now = new Date().toISOString();
      await this.db.sessions.deleteEnded(now, this.unusedSince(Date.now()));
      await this.db.signUps.deleteExpired(now);
    } catch (error) {
      this.logger.warn(
        `Couldn’t delete ended sessions and sign-ups: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Sessions last used before this have gone idle. */
  private unusedSince(now: number): string {
    return new Date(now - this.idleHours * 3_600_000).toISOString();
  }

  /**
   * Checks the password and starts a session. 429 once an email, or the
   * address it comes from, has failed too often; `ip` is the visitor's
   * trusted address, or null.
   */
  async signIn(
    { email, password }: SignInRequest,
    ip: string | null,
  ): Promise<SignInStep> {
    if (
      await this.limits.blocked(['sign-in-email', email], ['sign-in-ip', ip])
    ) {
      throw new HttpException(
        'Too many sign-in attempts. Wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.db.users.findByEmail(email);
    // Without an account, a sign-up still waiting for its link is checked
    // instead, the same slow way, so its answer takes no longer.
    const waiting = user ? null : await this.db.signUps.findByEmail(email);
    const valid = await verifyPassword(
      password,
      user?.passwordHash ?? waiting?.passwordHash ?? (await this.dummyHash),
    );
    if (!user && waiting && valid) {
      await this.limits.clear('sign-in-email', email);
      return { emailUnconfirmed: true };
    }
    if (!user || !valid) {
      await this.limits.hit(['sign-in-email', email], ['sign-in-ip', ip]);
      // Not awaited, so a known email takes no longer to reject than an
      // unknown one; it never throws.
      if (user) void this.noteFailedSignIn(user, ip);
      throw new UnauthorizedException('Email or password is incorrect');
    }
    await this.limits.clear('sign-in-email', email);

    const [membership] = await this.db.users.memberships(user.id);
    if (!membership) {
      throw new ForbiddenException(
        'This account isn’t part of a workspace yet',
      );
    }
    // Before the code, so nobody types one only to be turned away.
    if (await this.db.workspaces.suspension(membership.workspaceId)) {
      await this.audit.record(membership.workspaceId, user, {
        kind: 'sign-in',
        what: 'Sign-in refused: the workspace is suspended',
        outcome: 'failed',
        ip,
      });
      throw workspaceSuspended();
    }
    if (await this.twoFactor.isOn(user.id)) {
      await this.audit.record(membership.workspaceId, user, {
        kind: 'sign-in',
        what: 'Password accepted; asked for the two-factor code',
        ip,
      });
      return this.askForCode(user.id);
    }
    await this.audit.record(membership.workspaceId, user, {
      kind: 'sign-in',
      what: 'Signed in',
      ip,
    });
    return this.startSession(user.id, membership.workspaceId);
  }

  private askForCode(userId: string): TwoFactorChallenge {
    return {
      twoFactorRequired: true,
      challenge: this.twoFactor.challenge(userId),
    };
  }

  /**
   * Finishes a sign-in with the code from the app, or a recovery code. 400
   * when the challenge is stale; 401 when the code is wrong; 429 after too
   * many wrong ones.
   */
  async completeTwoFactor(
    { challenge, code }: TwoFactorSignIn,
    ip: string | null,
  ): Promise<SignInResponse> {
    const userId = this.twoFactor.openChallenge(challenge);
    const user = userId ? await this.db.users.get(userId) : null;
    if (!user) {
      throw new BadRequestException(
        'That sign-in took too long. Sign in again.',
      );
    }
    const [membership] = await this.db.users.memberships(user.id);
    if (!membership) {
      throw new ForbiddenException(
        'This account isn’t part of a workspace yet',
      );
    }
    const used = await this.twoFactor.check(user.id, code);
    if (!used) {
      await this.audit.record(membership.workspaceId, user, {
        kind: 'sign-in',
        what: 'Two-factor code didn’t match',
        outcome: 'failed',
        ip,
      });
      throw new UnauthorizedException(
        'That code didn’t match. Use the newest code from your app, or a recovery code.',
      );
    }
    const left =
      used === 'recovery'
        ? await this.twoFactor.recoveryCodesLeft(user.id)
        : null;
    await this.audit.record(membership.workspaceId, user, {
      kind: 'sign-in',
      what:
        left === null
          ? 'Signed in with two-factor'
          : `Signed in with a recovery code (${left} left)`,
      ip,
    });
    if (left !== null) {
      await this.events.publish(membership.workspaceId, user.id, {
        type: 'security.recovery-code-used',
        userId: user.id,
        remaining: left,
      });
    }
    return this.startSession(user.id, membership.workspaceId);
  }

  private async noteFailedSignIn(user: User, ip: string | null) {
    await this.audit.recordForUser(user, {
      kind: 'sign-in',
      what: 'Sign-in failed: wrong password',
      outcome: 'failed',
      ip,
    });
    try {
      if (await this.limits.blocked(['sign-in-email', user.email])) {
        const { max, windowMs } = LIMITS['sign-in-email'];
        await this.audit.recordForUser(user, {
          kind: 'sign-in',
          what: `Sign-in locked for ${windowMs / 60_000} minutes after ${max} failed attempts`,
          outcome: 'failed',
          ip,
        });
        await this.events.publishForUser(user, {
          type: 'security.locked-out',
          userId: user.id,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Couldn’t check a lockout: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Starts a sign-up: emails a link to confirm the address. Answers the same
   * way, and as quickly, whether or not the email has an account; one that
   * has gets an email saying so instead. 429 after several from one address,
   * or to one email, in an hour.
   */
  async signUp(request: SignUpRequest, ip: string | null): Promise<void> {
    const { email } = request;
    if (
      await this.limits.blocked(['sign-up-ip', ip], ['sign-up-email', email])
    ) {
      throw new HttpException(
        'Too many sign-ups from your network, or for this email. Try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.limits.hit(['sign-up-ip', ip], ['sign-up-email', email]);
    void this.startSignUp(request, ip).catch((error: unknown) => {
      this.logger.error(
        `Couldn’t start a sign-up: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async startSignUp(
    { email, password, timeZone, browserKey }: SignUpRequest,
    ip: string | null,
  ): Promise<void> {
    const user = await this.db.users.findByEmail(email);
    if (user) {
      await this.audit.recordForUser(user, {
        kind: 'sign-in',
        what: 'Someone tried to sign up again with this email',
        ip,
      });
      await this.sendAccountExists(user);
      return;
    }
    await this.sendSignUpLink({
      email,
      passwordHash: await hashPassword(password),
      browserHash: browserKey ? hashToken(browserKey) : null,
      timeZone: timeZone ?? 'UTC',
    });
  }

  /**
   * Sends the link again, with a new token, if a sign-up for the email is
   * waiting. Answers the same way either way; shares sign-up's limits.
   */
  async resendSignUp(email: string, ip: string | null): Promise<void> {
    if (
      await this.limits.blocked(['sign-up-ip', ip], ['sign-up-email', email])
    ) {
      throw new HttpException(
        'Dossier has sent this address several links already. Wait an hour, or use the newest one.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.limits.hit(['sign-up-email', email]);
    void this.resend(email).catch((error: unknown) => {
      this.logger.error(
        `Couldn’t send a sign-up link again: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async resend(email: string): Promise<boolean> {
    const waiting = await this.db.signUps.findByEmail(email);
    if (!waiting || (await this.db.users.findByEmail(email))) return false;
    await this.sendSignUpLink(waiting);
    return true;
  }

  /**
   * Saves the sign-up with a new token, good for SIGN_UP_HOURS, replacing
   * any waiting for the email, and emails its link.
   */
  private async sendSignUpLink(
    signUp: Omit<SignUpRecord, 'tokenHash' | 'createdAt' | 'expiresAt'>,
  ): Promise<void> {
    // Like sessions, links run on real time, never the pinned test clock.
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    await this.db.signUps.save({
      ...signUp,
      tokenHash: hashToken(token),
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + SIGN_UP_HOURS * 3_600_000,
      ).toISOString(),
    });
    const link = new URL('/verify-email', this.webUrl);
    link.searchParams.set('token', token);
    await this.mailer.send({
      to: [signUp.email],
      subject: 'Confirm your email for Dossier',
      text: [
        'Hi,',
        '',
        `To finish creating your Dossier account for ${signUp.email}, confirm your email by opening this link within the next ${SIGN_UP_HOURS} hours:`,
        '',
        link.href,
        '',
        'Dossier will then help you set up your workspace. It takes about five minutes.',
        '',
        'If you didn’t sign up for Dossier, ignore this email. Without the link, no account is made.',
      ].join('\n'),
      tag: 'sign-up',
    });
  }

  /** For a sign-up with an email that has an account: says so, and how to get in. */
  private async sendAccountExists(user: User): Promise<void> {
    await this.mailer.send({
      to: [user.email],
      subject: 'You already have a Dossier account',
      text: [
        `Hi ${user.name},`,
        '',
        `Someone, hopefully you, tried to sign up for Dossier with ${user.email}. That email already has an account, so no new one was made.`,
        '',
        `Sign in: ${new URL('/sign-in', this.webUrl).href}`,
        `Forgotten your password? ${new URL('/forgot-password', this.webUrl).href}`,
        '',
        'If it wasn’t you, nothing has changed and you can ignore this email.',
      ].join('\n'),
      tag: 'sign-up-exists',
    });
  }

  /**
   * Opens a sign-up's link: creates the account and its workspace, and signs
   * in. Away from the browser that signed up, asks for the password first,
   * so a link alone can't take over an account someone else chose the
   * password for. 400 when the link expired or was used; 401 for a wrong
   * password; 409 when the email has an account by now.
   */
  async confirmSignUp(
    { token, browserKey, password }: SignUpConfirm,
    ip: string | null,
  ): Promise<SignUpConfirmStep> {
    const tokenHash = hashToken(token);
    const signUp = await this.db.signUps.find(tokenHash);
    const now = new Date().toISOString();
    if (!signUp || signUp.expiresAt <= now) throw usedSignUpLink();

    const sameBrowser =
      browserKey !== undefined &&
      signUp.browserHash !== null &&
      sameHash(hashToken(browserKey), signUp.browserHash);
    if (!sameBrowser) {
      if (password === undefined) return { passwordRequired: true };
      if (await this.limits.blocked(['sign-in-email', signUp.email])) {
        throw new HttpException(
          'Too many attempts. Wait a few minutes and try again.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (!(await verifyPassword(password, signUp.passwordHash))) {
        await this.limits.hit(['sign-in-email', signUp.email]);
        throw new UnauthorizedException(
          'That isn’t the password you chose when you signed up.',
        );
      }
    }

    const workspace = {
      id: `ws-${randomBytes(6).toString('hex')}`,
      name: workspaceNameFromEmail(signUp.email),
      timeZone: signUp.timeZone,
    };
    const user = {
      id: `usr-${randomBytes(8).toString('hex')}`,
      name: nameFromEmail(signUp.email),
      title: '',
    };
    const outcome = await this.db.signUps.complete(
      tokenHash,
      workspace,
      user,
      now,
    );
    if (outcome === 'invalid') throw usedSignUpLink();
    if (outcome === 'taken') {
      throw new ConflictException(
        'An account already uses this email. Sign in instead.',
      );
    }
    await this.audit.record(
      workspace.id,
      { ...user, email: signUp.email },
      {
        kind: 'sign-in',
        what: 'Confirmed their email, created the workspace and signed in',
        ip,
      },
    );
    return this.startSession(user.id, workspace.id);
  }

  /**
   * Emails a reset link if the address has an account. Answers the same way,
   * and as quickly, either way: the lookup and the email happen afterwards.
   */
  async requestPasswordReset(email: string, ip: string | null): Promise<void> {
    if (await this.limits.blocked(['reset-email', email], ['reset-ip', ip])) {
      throw new HttpException(
        'Too many reset emails for this address. Wait an hour and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.limits.hit(['reset-email', email], ['reset-ip', ip]);
    void this.sendReset(email, ip).catch((error: unknown) => {
      this.logger.error(
        `Couldn’t send a password reset: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async sendReset(email: string, ip: string | null): Promise<void> {
    const user = await this.db.users.findByEmail(email);
    // No account yet, but maybe a sign-up waiting: its link is what they
    // need, within sign-up's own limit for the address.
    if (!user) {
      if (await this.limits.blocked(['sign-up-email', email])) return;
      if (await this.resend(email)) {
        await this.limits.hit(['sign-up-email', email]);
      }
      return;
    }
    // A link couldn't be used while the workspace is suspended.
    const [membership] = await this.db.users.memberships(user.id);
    if (
      membership &&
      (await this.db.workspaces.suspension(membership.workspaceId))
    ) {
      return;
    }
    await this.audit.recordForUser(user, {
      kind: 'sign-in',
      what: 'Asked for a password reset email',
      ip,
    });
    await this.mailResetLink(user);
  }

  /**
   * Emails someone a link to choose a new password, replacing any unused
   * one. No limits apply: callers decide who may ask. Throws if the email
   * can't be sent.
   */
  async mailResetLink(user: User): Promise<void> {
    // Like sessions, resets run on real time, never the pinned test clock.
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    await this.db.passwordResets.create({
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000).toISOString(),
    });

    const link = new URL('/reset-password', this.webUrl);
    link.searchParams.set('token', token);
    await this.mailer.send({
      to: [user.email],
      subject: 'Reset your Dossier password',
      text: [
        `Hi ${user.name},`,
        '',
        `Someone asked to reset the password for your Dossier account (${user.email}). To choose a new one, open this link within the next hour:`,
        '',
        link.href,
        '',
        'The link works once, and signs you out of Dossier everywhere else. If you didn’t ask for it, ignore this email: your password stays as it is.',
      ].join('\n'),
      tag: 'password-reset',
    });
  }

  /**
   * Sets a new password with a reset link's token, ends every other session
   * the user had, and signs them in, or asks for their two-factor code first.
   * 400 when the link expired or was used.
   */
  async resetPassword(
    { token, password }: PasswordResetConfirm,
    ip: string | null,
  ): Promise<PasswordResetStep> {
    const userId = await this.db.passwordResets.consume(
      hashToken(token),
      new Date().toISOString(),
    );
    if (!userId) {
      throw new BadRequestException(
        'This reset link has expired or was already used. Ask for a new one.',
      );
    }
    // Refused before the password changes.
    const [suspendedIn] = await this.db.users.memberships(userId);
    if (
      suspendedIn &&
      (await this.db.workspaces.suspension(suspendedIn.workspaceId))
    ) {
      throw workspaceSuspended();
    }
    await this.db.users.setPassword(userId, await hashPassword(password));
    await this.db.sessions.deleteForUser(userId);

    const user = await this.db.users.get(userId);
    if (user) {
      await this.limits.clear('sign-in-email', user.email);
      await this.audit.recordForUser(user, {
        kind: 'sign-in',
        what: 'Set a new password with a reset link, signing out everywhere else',
        ip,
      });
      await this.events.publishForUser(user, {
        type: 'security.password-reset',
        userId: user.id,
      });
    }
    const [membership] = await this.db.users.memberships(userId);
    if (!membership) {
      throw new ForbiddenException(
        'This account isn’t part of a workspace yet',
      );
    }
    // An inbox is one factor: with two-factor on, the code is still needed.
    if (await this.twoFactor.isOn(userId)) return this.askForCode(userId);
    return this.startSession(userId, membership.workspaceId);
  }

  /** Who invited whom, to what, for the invite page. 400 if it can't be used. */
  async previewInvite(token: string): Promise<InvitePreview> {
    const { invite, workspace } = await this.usableInvite(token);
    return {
      workspaceName: workspace.name,
      email: invite.email,
      role: invite.role,
      invitedBy: invite.invitedBy,
    };
  }

  /**
   * Creates the account with the invite's email and role, and signs in. 400
   * when the invite can't be used; 409 when the email has an account.
   */
  async acceptInvite(
    { token, name, title, password }: InviteAccept,
    ip: string | null,
  ): Promise<SignInResponse> {
    const { invite } = await this.usableInvite(token);
    const user = {
      id: `usr-${randomBytes(8).toString('hex')}`,
      email: invite.email,
      // Onboarding asks for it next, starting from this.
      name: name || nameFromEmail(invite.email),
      title: title ?? '',
      passwordHash: await hashPassword(password),
    };
    const outcome = await this.db.invites.accept(
      hashToken(token),
      user,
      new Date().toISOString(),
    );
    if (outcome === 'invalid') throw unusableInvite();
    if (outcome === 'taken') {
      throw new ConflictException(
        'An account already uses this email. Sign in instead.',
      );
    }
    await this.audit.record(invite.workspaceId, user, {
      kind: 'sign-in',
      what: 'Accepted the invite and signed in',
      ip,
    });
    await this.events.publish(invite.workspaceId, user.id, {
      type: 'member.joined',
      userId: user.id,
      name: user.name,
      role: invite.role,
    });
    return this.startSession(user.id, invite.workspaceId);
  }

  private async usableInvite(token: string) {
    const invite = await this.db.invites.findByToken(hashToken(token));
    if (!invite || invite.expiresAt <= new Date().toISOString()) {
      throw unusableInvite();
    }
    const workspace = await this.db.workspaces.get(invite.workspaceId);
    if (!workspace) throw unusableInvite();
    if (await this.db.workspaces.suspension(invite.workspaceId)) {
      throw workspaceSuspended();
    }
    return { invite, workspace };
  }

  private async startSession(
    userId: string,
    workspaceId: string,
  ): Promise<SignInResponse> {
    // Every way in comes through here: one last check.
    if (await this.db.workspaces.suspension(workspaceId)) {
      throw workspaceSuspended();
    }
    // Sessions run on real time, never the pinned test clock.
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      now.getTime() + this.sessionDays * 86_400_000,
    ).toISOString();
    await this.db.sessions.create({
      tokenHash: hashToken(token),
      userId,
      workspaceId,
      createdAt: now.toISOString(),
      expiresAt,
      lastSeenAt: now.toISOString(),
    });
    return { token, expiresAt, me: await this.me(userId, workspaceId) };
  }

  /**
   * The live session for a token, or null if it is unknown, expired, went
   * unused for SESSION_IDLE_HOURS, or its workspace was suspended. Notes its
   * use every few minutes.
   */
  async authenticate(token: string): Promise<SessionRecord | null> {
    const tokenHash = hashToken(token);
    const found = await this.db.sessions.find(tokenHash);
    if (!found) return null;
    const { workspaceSuspended: suspended, ...session } = found;
    const now = Date.now();
    const at = new Date(now).toISOString();
    if (
      suspended ||
      session.expiresAt <= at ||
      session.lastSeenAt < this.unusedSince(now)
    ) {
      await this.db.sessions.delete(tokenHash);
      return null;
    }
    if (now - Date.parse(session.lastSeenAt) >= TOUCH_EVERY_MS) {
      await this.db.sessions.touch(tokenHash, at);
      return { ...session, lastSeenAt: at };
    }
    return session;
  }

  /** This session, and how many others the user has live. */
  async sessions(token: string, userId: string): Promise<Sessions> {
    const tokenHash = hashToken(token);
    const now = Date.now();
    const at = new Date(now).toISOString();
    const unusedSince = this.unusedSince(now);
    const live = (await this.db.sessions.listForUser(userId)).filter(
      (s) => s.expiresAt > at && s.lastSeenAt >= unusedSince,
    );
    const current = live.find((s) => s.tokenHash === tokenHash);
    if (!current) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    const others = live.filter((s) => s !== current);
    return {
      current: {
        createdAt: current.createdAt,
        lastSeenAt: current.lastSeenAt,
        expiresAt: current.expiresAt,
      },
      others: others.length,
      othersLastSeenAt:
        others
          .map((s) => s.lastSeenAt)
          .sort()
          .at(-1) ?? null,
      idleHours: this.idleHours,
    };
  }

  /** Ends every session the user has but this one. */
  async signOutOthers(
    token: string,
    userId: string,
    workspaceId: string,
    ip: string | null,
  ): Promise<void> {
    await this.db.sessions.deleteForUser(userId, hashToken(token));
    await this.audit.record(workspaceId, userId, {
      kind: 'sign-in',
      what: 'Signed out everywhere else',
      ip,
    });
  }

  async signOut(
    token: string,
    userId: string,
    workspaceId: string,
    ip: string | null,
  ): Promise<void> {
    await this.db.sessions.delete(hashToken(token));
    await this.audit.record(workspaceId, userId, {
      kind: 'sign-in',
      what: 'Signed out',
      ip,
    });
  }

  /** The user's role in the workspace, or null if they aren't in it. */
  async roleOf(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceRole | null> {
    return roleIn(this.db, userId, workspaceId);
  }

  async me(userId: string, workspaceId: string): Promise<Me> {
    const [user, workspace, memberships, setup] = await Promise.all([
      this.db.users.get(userId),
      this.db.workspaces.get(workspaceId),
      this.db.users.memberships(userId),
      this.setupOf(userId),
    ]);
    const membership = memberships.find((m) => m.workspaceId === workspaceId);
    if (!user || !workspace || !membership) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    return { user, workspace, role: membership.role, setup };
  }

  /**
   * What's left before they can use Dossier. Two-factor they must keep on
   * only counts while the API can check codes (it has CONNECTOR_SECRET_KEY).
   */
  async setupOf(userId: string): Promise<AccountSetupState> {
    const setup = await this.db.users.setup(userId);
    if (!setup) return 'done';
    if (!setup.onboardedAt) return 'onboarding';
    if (
      setup.twoFactorRequired &&
      !setup.twoFactorOn &&
      this.twoFactor.available
    ) {
      return 'two-factor';
    }
    return 'done';
  }
}

/** Compares two hex hashes in constant time. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
