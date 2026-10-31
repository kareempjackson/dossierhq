import type {
  Staff,
  StaffInvite,
  StaffInviteCreate,
  StaffList,
  StaffRole,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { notFound } from '../common/not-found.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { MAILER, MailError, type Mailer } from '../mail/mailer.js';
import { StaffAudit } from './staff-audit.js';
import { publicStaff } from './staff-auth.service.js';
import {
  STAFF_INVITE_DAYS,
  createStaffInvite,
  staffInviteLink,
} from './staff-invites.js';

const AS_ROLE: Record<StaffRole, string> = {
  support: 'support',
  admin: 'an admin',
};

/**
 * Who is on the staff, and inviting more. Admins manage staff; there is
 * always at least one admin with access, and nobody takes away their own.
 */
@Injectable()
export class StaffService {
  private readonly adminUrl: string;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly log: StaffAudit,
    config: ConfigService<AppConfig, true>,
  ) {
    this.adminUrl = config.get('ADMIN_URL', { infer: true });
  }

  async list(): Promise<StaffList> {
    const [data, invites] = await Promise.all([
      this.db.staff.list(),
      this.db.staff.invites(),
    ]);
    return { data, invites };
  }

  /**
   * Emails a link to join. 409 when the email is already staff; 502 when the
   * email can't be sent (and then no invite is kept).
   */
  async invite(
    staffId: string,
    { email, role }: StaffInviteCreate,
    ip: string | null,
  ): Promise<StaffInvite> {
    if (await this.db.staff.findByEmail(email)) {
      throw new ConflictException('This email is already on the staff.');
    }
    const inviter = await this.actor(staffId);
    const { invite, token } = await createStaffInvite(this.db, {
      email,
      role,
      from: inviter,
    });
    try {
      await this.mailer.send({
        to: [email],
        replyTo: inviter.email,
        subject: `${inviter.name} invited you to Dossier Admin`,
        text: [
          'Hi,',
          '',
          `${inviter.name} invited you to join Dossier's staff as ${AS_ROLE[role]}. Dossier Admin is where the team looks after every workspace on Dossier.`,
          '',
          `To join, open this link within ${STAFF_INVITE_DAYS} days. You'll choose a password and add Dossier Admin to an authenticator app:`,
          '',
          staffInviteLink(this.adminUrl, token),
          '',
          `If you weren’t expecting this, ignore it, or reply to ask ${inviter.name} about it.`,
        ].join('\n'),
        tag: 'staff-invite',
      });
    } catch (error) {
      await this.db.staff.removeInvite(invite.id);
      throw new BadGatewayException(
        error instanceof MailError
          ? `Dossier couldn’t email the invite: ${error.message}`
          : 'Dossier couldn’t email the invite. Try again shortly.',
      );
    }
    await this.log.record(inviter, {
      what: `Invited ${email} to the staff as ${AS_ROLE[role]}`,
      ip,
    });
    return invite;
  }

  async withdrawInvite(staffId: string, id: string, ip: string | null) {
    const invite = (await this.db.staff.invites()).find((i) => i.id === id);
    if (!invite || !(await this.db.staff.removeInvite(id))) {
      notFound('Invite', id);
    }
    await this.log.record(await this.actor(staffId), {
      what: `Withdrew the staff invite to ${invite.email}`,
      ip,
    });
  }

  async setRole(
    staffId: string,
    id: string,
    role: StaffRole,
    ip: string | null,
  ): Promise<Staff> {
    const target = await this.db.staff.get(id);
    if (!target || target.disabledAt) notFound('Member of staff', id);
    if (target.role === role) return publicStaff(target);
    if (role !== 'admin') await this.keepAnAdmin(id);
    await this.db.staff.setRole(id, role);
    await this.log.record(await this.actor(staffId), {
      what: `Made ${target.name} ${AS_ROLE[role]}`,
      ip,
    });
    return { ...publicStaff(target), role };
  }

  /** Takes away someone's access and ends their sessions. */
  async disable(staffId: string, id: string, ip: string | null) {
    if (id === staffId) {
      throw new ForbiddenException(
        'You can’t take away your own access. Ask another admin.',
      );
    }
    const target = await this.db.staff.get(id);
    if (!target || target.disabledAt) notFound('Member of staff', id);
    await this.keepAnAdmin(id);
    await this.db.staff.disable(id, new Date().toISOString());
    await this.log.record(await this.actor(staffId), {
      what: `Took away ${target.name}’s access`,
      ip,
    });
  }

  /** 409 when `id` is the only admin with access. */
  private async keepAnAdmin(id: string) {
    const admins = (await this.db.staff.list()).filter(
      (s) => s.role === 'admin' && !s.disabledAt,
    );
    if (admins.length === 1 && admins[0]!.id === id) {
      throw new ConflictException(
        'There must always be an admin. Make someone else an admin first.',
      );
    }
  }

  private async actor(staffId: string) {
    const staff = await this.db.staff.get(staffId);
    if (!staff) notFound('Member of staff', staffId);
    return publicStaff(staff);
  }
}
