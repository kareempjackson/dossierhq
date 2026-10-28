import type {
  Invite,
  InviteCreate,
  Member,
  WorkspaceRole,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuditLog } from '../audit/audit-log.js';
import { hashToken } from '../auth/auth.service.js';
import { RateLimits } from '../auth/rate-limits.js';
import { roleIn } from '../auth/roles.js';
import { notFound } from '../common/not-found.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { MAILER, MailError, type Mailer } from '../mail/mailer.js';

/** How long an invite link works. */
export const INVITE_DAYS = 7;

const A_ROLE: Record<WorkspaceRole, string> = {
  owner: 'an owner',
  admin: 'an admin',
  technician: 'a technician',
};

/**
 * Who is in a workspace, and inviting more. Owners and admins manage people;
 * only owners make or unmake owners, and a workspace always keeps one.
 */
@Injectable()
export class MembersService {
  private readonly webUrl: string;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly audit: AuditLog,
    private readonly limits: RateLimits,
    config: ConfigService<AppConfig, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  members(workspaceId: string): Promise<Member[]> {
    return this.db.users.members(workspaceId);
  }

  invites(workspaceId: string): Promise<Invite[]> {
    return this.db.invites.list(workspaceId);
  }

  /**
   * Emails a link to join. 409 when the email already has an account, since
   * each person belongs to one workspace for now; 429 past the day's limit;
   * 502 when the email can't be sent (and then no invite is kept).
   */
  async invite(
    workspaceId: string,
    inviterId: string,
    { email, role }: InviteCreate,
  ): Promise<Invite> {
    // Anyone can sign up, so invites mustn't become a way to email strangers.
    if (await this.limits.blocked(['invites', workspaceId])) {
      throw new HttpException(
        'This workspace has sent 20 invites today. Try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (await this.db.users.findByEmail(email)) {
      throw new ConflictException(
        'This email already has a Dossier account. For now, each person can belong to one workspace.',
      );
    }
    const [inviter, workspace] = await Promise.all([
      this.db.users.get(inviterId),
      this.db.workspaces.get(workspaceId),
    ]);
    if (!inviter || !workspace) notFound('Workspace');

    // Like sessions, invites run on real time, never the pinned test clock.
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    const invite: Invite = {
      id: `inv-${randomUUID()}`,
      email,
      role,
      invitedBy: inviter.name,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + INVITE_DAYS * 86_400_000,
      ).toISOString(),
    };
    await this.db.invites.save(workspaceId, {
      ...invite,
      tokenHash: hashToken(token),
      invitedByUserId: inviter.id,
    });

    const link = new URL('/invite', this.webUrl);
    link.searchParams.set('token', token);
    try {
      await this.mailer.send({
        to: [email],
        replyTo: inviter.email,
        subject: `${inviter.name} invited you to ${workspace.name} on Dossier`,
        text: [
          'Hi,',
          '',
          `${inviter.name} invited you to join ${workspace.name} on Dossier as ${A_ROLE[role]}. Dossier shows what needs attention at each of your clients, and drafts their weekly reports.`,
          '',
          `To join, open this link within ${INVITE_DAYS} days and choose a password:`,
          '',
          link.href,
          '',
          `If you weren’t expecting this, ignore it, or reply to ask ${inviter.name} about it.`,
        ].join('\n'),
        tag: 'invite',
      });
    } catch (error) {
      await this.db.invites.remove(workspaceId, invite.id);
      throw new BadGatewayException(
        error instanceof MailError
          ? `Dossier couldn’t email the invite: ${error.message}`
          : 'Dossier couldn’t email the invite. Try again shortly.',
      );
    }
    await this.limits.hit(['invites', workspaceId]);
    await this.audit.record(workspaceId, inviter, {
      kind: 'change',
      what: `Invited ${email} as ${A_ROLE[role]}`,
    });
    return invite;
  }

  async withdraw(
    workspaceId: string,
    actorId: string,
    id: string,
  ): Promise<void> {
    const invite = (await this.db.invites.list(workspaceId)).find(
      (i) => i.id === id,
    );
    if (!invite || !(await this.db.invites.remove(workspaceId, id))) {
      notFound('Invite', id);
    }
    await this.audit.record(workspaceId, actorId, {
      kind: 'change',
      what: `Withdrew the invite for ${invite.email}`,
    });
  }

  async setRole(
    workspaceId: string,
    actorId: string,
    userId: string,
    role: WorkspaceRole,
  ): Promise<Member> {
    const { member, members } = await this.target(workspaceId, userId);
    await this.checkOwnerChange(workspaceId, actorId, member, members, role);
    if (member.role !== role) {
      await this.db.users.setRole(workspaceId, userId, role);
      await this.audit.record(workspaceId, actorId, {
        kind: 'change',
        what: `Made ${member.name} ${A_ROLE[role]} (was ${A_ROLE[member.role]})`,
      });
    }
    return { ...member, role };
  }

  /** Removes them and their account, and ends their sessions. */
  async remove(
    workspaceId: string,
    actorId: string,
    userId: string,
  ): Promise<void> {
    const { member, members } = await this.target(workspaceId, userId);
    await this.checkOwnerChange(workspaceId, actorId, member, members, null);
    await this.db.users.removeMember(workspaceId, userId);
    await this.audit.record(workspaceId, actorId, {
      kind: 'change',
      what: `Removed ${member.name} (${member.email}) from the workspace`,
    });
  }

  private async target(workspaceId: string, userId: string) {
    const members = await this.db.users.members(workspaceId);
    const member = members.find((m) => m.id === userId);
    if (!member) notFound('Member', userId);
    return { member, members };
  }

  /**
   * Only owners touch owners, and the last owner stays one. `role` is the new
   * role, or null for removing them.
   */
  private async checkOwnerChange(
    workspaceId: string,
    actorId: string,
    member: Member,
    members: Member[],
    role: WorkspaceRole | null,
  ) {
    if (member.role !== 'owner' && role !== 'owner') return;
    if ((await roleIn(this.db, actorId, workspaceId)) !== 'owner') {
      throw new ForbiddenException(
        'Only an owner can make someone an owner, or change or remove an owner.',
      );
    }
    const owners = members.filter((m) => m.role === 'owner').length;
    if (member.role === 'owner' && role !== 'owner' && owners === 1) {
      throw new ConflictException(
        'A workspace needs an owner. Make someone else an owner first.',
      );
    }
  }
}
