import type {
  InviteAccept,
  InvitePreview,
  Me,
  PasswordResetConfirm,
  Sessions,
  SignInRequest,
  SignInResponse,
  SignInStep,
  SignUpRequest,
  TwoFactorSignIn,
  User,
  WorkspaceRole,
} from '@dossierhq/contracts';
import type { DatabaseAdapter, SessionRecord } from '@dossierhq/database';
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
import { createHash, randomBytes } from 'node:crypto';
import { AuditLog } from '../audit/audit-log.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { EventBus } from '../events/event-bus.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { hashPassword, verifyPassword } from './password.js';
import { roleIn } from './roles.js';
import { LIMITS, RateLimits } from './rate-limits.js';
import { TwoFactorService } from './two-factor.service.js';

/** Sessions and password resets store only this hash of the token. */
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** How long a reset link works. */
export const RESET_MINUTES = 60;

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
      await this.db.sessions.deleteEnded(
        new Date().toISOString(),
        this.unusedSince(Date.now()),
      );
    } catch (error) {
      this.logger.warn(
        `Couldn’t delete ended sessions: ${error instanceof Error ? error.message : String(error)}`,
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
    const valid = await verifyPassword(
      password,
      user?.passwordHash ?? (await this.dummyHash),
    );
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

  private askForCode(userId: string): SignInStep {
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
   * Creates a workspace with the person signing up as its owner, then signs
   * them in. 409 when the email already has an account; 429 after several
   * from one address in an hour.
   */
  async signUp(
    request: SignUpRequest,
    ip: string | null,
  ): Promise<SignInResponse> {
    if (await this.limits.blocked(['sign-up-ip', ip])) {
      throw new HttpException(
        'Too many new workspaces from your network. Try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Counted before the email is checked, so working out which emails have
    // accounts from 409s is as slow as signing up.
    await this.limits.hit(['sign-up-ip', ip]);
    const workspace = {
      id: `ws-${randomBytes(6).toString('hex')}`,
      name: request.workspaceName,
      timeZone: request.timeZone,
    };
    const user = {
      id: `usr-${randomBytes(8).toString('hex')}`,
      email: request.email,
      name: request.name,
      title: request.title,
      passwordHash: await hashPassword(request.password),
    };
    if (!(await this.db.users.createOwner(workspace, user))) {
      throw new ConflictException(
        'An account already uses this email. Sign in instead.',
      );
    }
    await this.audit.record(workspace.id, user, {
      kind: 'sign-in',
      what: 'Created the workspace and signed in',
      ip,
    });
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
    if (!user) return;
    await this.audit.recordForUser(user, {
      kind: 'sign-in',
      what: 'Asked for a password reset email',
      ip,
    });

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
  ): Promise<SignInStep> {
    const userId = await this.db.passwordResets.consume(
      hashToken(token),
      new Date().toISOString(),
    );
    if (!userId) {
      throw new BadRequestException(
        'This reset link has expired or was already used. Ask for a new one.',
      );
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
      name,
      title,
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
    return { invite, workspace };
  }

  private async startSession(
    userId: string,
    workspaceId: string,
  ): Promise<SignInResponse> {
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
   * The live session for a token, or null if it is unknown, expired, or went
   * unused for SESSION_IDLE_HOURS. Notes its use every few minutes.
   */
  async authenticate(token: string): Promise<SessionRecord | null> {
    const tokenHash = hashToken(token);
    const session = await this.db.sessions.find(tokenHash);
    if (!session) return null;
    const now = Date.now();
    const at = new Date(now).toISOString();
    if (session.expiresAt <= at || session.lastSeenAt < this.unusedSince(now)) {
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
    const [user, workspace, memberships] = await Promise.all([
      this.db.users.get(userId),
      this.db.workspaces.get(workspaceId),
      this.db.users.memberships(userId),
    ]);
    const membership = memberships.find((m) => m.workspaceId === workspaceId);
    if (!user || !workspace || !membership) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    return { user, workspace, role: membership.role };
  }
}
