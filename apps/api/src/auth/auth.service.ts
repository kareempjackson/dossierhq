import type {
  Me,
  PasswordResetConfirm,
  SignInRequest,
  SignInResponse,
  SignUpRequest,
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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { hashPassword, verifyPassword } from './password.js';
import { ResetLimiter, SignInLimiter } from './sign-in-limiter.js';

/** Sessions and password resets store only this hash of the token. */
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** How long a reset link works. */
export const RESET_MINUTES = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionDays: number;
  private readonly webUrl: string;
  /** Compared against when the email is unknown, so timing doesn't reveal it. */
  private readonly dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly limiter: SignInLimiter,
    private readonly resetLimiter: ResetLimiter,
    config: ConfigService<AppConfig, true>,
  ) {
    this.sessionDays = config.get('SESSION_DAYS', { infer: true });
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  async signIn({ email, password }: SignInRequest): Promise<SignInResponse> {
    if (this.limiter.isBlocked(email)) {
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
      this.limiter.recordFailure(email);
      throw new UnauthorizedException('Email or password is incorrect');
    }
    this.limiter.reset(email);

    const [membership] = await this.db.users.memberships(user.id);
    if (!membership) {
      throw new ForbiddenException(
        'This account isn’t part of a workspace yet',
      );
    }
    return this.startSession(user.id, membership.workspaceId);
  }

  /**
   * Creates a workspace with the person signing up as its owner, then signs
   * them in. 409 when the email already has an account.
   */
  async signUp(request: SignUpRequest): Promise<SignInResponse> {
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
    return this.startSession(user.id, workspace.id);
  }

  /**
   * Emails a reset link if the address has an account. Answers the same way,
   * and as quickly, either way: the lookup and the email happen afterwards.
   */
  async requestPasswordReset(email: string): Promise<void> {
    if (this.resetLimiter.isBlocked(email)) {
      throw new HttpException(
        'Too many reset emails for this address. Wait an hour and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.resetLimiter.record(email);
    void this.sendReset(email).catch((error: unknown) => {
      this.logger.error(
        `Couldn’t send a password reset: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async sendReset(email: string): Promise<void> {
    const user = await this.db.users.findByEmail(email);
    if (!user) return;

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
   * the user had, and signs them in. 400 when the link expired or was used.
   */
  async resetPassword({
    token,
    password,
  }: PasswordResetConfirm): Promise<SignInResponse> {
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
    if (user) this.limiter.reset(user.email);
    const [membership] = await this.db.users.memberships(userId);
    if (!membership) {
      throw new ForbiddenException(
        'This account isn’t part of a workspace yet',
      );
    }
    return this.startSession(userId, membership.workspaceId);
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
    });
    return { token, expiresAt, me: await this.me(userId, workspaceId) };
  }

  /** The live session for a token, or null if it is unknown or expired. */
  async authenticate(token: string): Promise<SessionRecord | null> {
    const tokenHash = hashToken(token);
    const session = await this.db.sessions.find(tokenHash);
    if (!session) return null;
    if (session.expiresAt <= new Date().toISOString()) {
      await this.db.sessions.delete(tokenHash);
      return null;
    }
    return session;
  }

  async signOut(token: string): Promise<void> {
    await this.db.sessions.delete(hashToken(token));
  }

  /** The user's role in the workspace, or null if they aren't in it. */
  async roleOf(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceRole | null> {
    const memberships = await this.db.users.memberships(userId);
    return memberships.find((m) => m.workspaceId === workspaceId)?.role ?? null;
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
