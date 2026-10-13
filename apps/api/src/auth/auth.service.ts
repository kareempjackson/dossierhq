import type { Me, SignInRequest, SignInResponse } from '@dossierhq/contracts';
import type { DatabaseAdapter, SessionRecord } from '@dossierhq/database';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { hashPassword, verifyPassword } from './password.js';
import { SignInLimiter } from './sign-in-limiter.js';

/** Sessions store only this hash of the token. */
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly sessionDays: number;
  /** Compared against when the email is unknown, so timing doesn't reveal it. */
  private readonly dummyHash = hashPassword(randomBytes(16).toString('hex'));

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly limiter: SignInLimiter,
    config: ConfigService<AppConfig, true>,
  ) {
    this.sessionDays = config.get('SESSION_DAYS', { infer: true });
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

    // Sessions run on real time, never the pinned demo clock.
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      now.getTime() + this.sessionDays * 86_400_000,
    ).toISOString();
    await this.db.sessions.create({
      tokenHash: hashToken(token),
      userId: user.id,
      workspaceId: membership.workspaceId,
      createdAt: now.toISOString(),
      expiresAt,
    });

    return {
      token,
      expiresAt,
      me: await this.me(user.id, membership.workspaceId),
    };
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
