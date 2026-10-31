import {
  EMPTY_WORKSPACE_PROFILE,
  workspaceProfileSchema,
  type companyUpdateSchema,
  type Me,
  type Onboarding,
  type profileUpdateSchema,
  type WorkspaceProfile,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { z } from 'zod';
import { AuditLog } from '../audit/audit-log.js';
import { DATABASE } from '../database/database.module.js';
import { AuthService } from './auth.service.js';
import { companyDomain } from './sign-up-names.js';
import { TwoFactorService } from './two-factor.service.js';

export type ProfileUpdateParsed = z.output<typeof profileUpdateSchema>;
export type CompanyUpdateParsed = z.output<typeof companyUpdateSchema>;

/** The stored profile, with anything missing or unreadable left empty. */
function profileOf(stored: Record<string, unknown>): WorkspaceProfile {
  const parsed = workspaceProfileSchema.partial().safeParse(stored);
  return { ...EMPTY_WORKSPACE_PROFILE, ...(parsed.success ? parsed.data : {}) };
}

/**
 * Onboarding: who someone is, their company, and two-factor, which they must
 * turn on before they finish (while the API can check codes). What they
 * save can be changed again afterwards.
 */
@Injectable()
export class OnboardingService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly auth: AuthService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditLog,
  ) {}

  async get(userId: string, workspaceId: string): Promise<Onboarding> {
    const [user, workspace, profile] = await Promise.all([
      this.db.users.get(userId),
      this.db.workspaces.get(workspaceId),
      this.db.workspaces.profile(workspaceId),
    ]);
    if (!user || !workspace) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    return {
      profile: { name: user.name, title: user.title },
      suggestedWebsite: companyDomain(user.email),
      company: {
        name: workspace.name,
        timeZone: workspace.timeZone,
        ...profileOf(profile),
      },
    };
  }

  async saveProfile(
    userId: string,
    workspaceId: string,
    profile: ProfileUpdateParsed,
  ): Promise<Onboarding> {
    await this.db.users.setProfile(userId, profile);
    return this.get(userId, workspaceId);
  }

  /** Changes what's given and keeps the rest. */
  async saveCompany(
    userId: string,
    workspaceId: string,
    { name, timeZone, ...changes }: CompanyUpdateParsed,
  ): Promise<Onboarding> {
    if (name !== undefined || timeZone !== undefined) {
      await this.db.workspaces.update(workspaceId, { name, timeZone });
    }
    if (Object.keys(changes).length > 0) {
      const profile = profileOf(await this.db.workspaces.profile(workspaceId));
      await this.db.workspaces.setProfile(workspaceId, {
        ...profile,
        ...changes,
      });
    }
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      what: 'Changed the company’s details',
    });
    return this.get(userId, workspaceId);
  }

  /**
   * Finishes onboarding; from then on they keep two-factor on. 409 until
   * it's on. Finishing again changes nothing.
   */
  async finish(
    userId: string,
    workspaceId: string,
    ip: string | null,
  ): Promise<Me> {
    const setup = await this.auth.setupOf(userId);
    if (setup === 'two-factor') {
      throw new ConflictException('Turn two-factor sign-in back on first.');
    }
    if (setup === 'onboarding') {
      const twoFactorOn = await this.twoFactor.isOn(userId);
      if (this.twoFactor.available && !twoFactorOn) {
        throw new ConflictException('Turn on two-factor sign-in first.');
      }
      await this.db.users.finishOnboarding(
        userId,
        new Date().toISOString(),
        twoFactorOn,
      );
      await this.audit.record(workspaceId, userId, {
        kind: 'sign-in',
        what: 'Finished setting up their account',
        ip,
      });
    }
    return this.auth.me(userId, workspaceId);
  }
}
