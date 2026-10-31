import {
  WORKSPACE_PAGE_SIZE,
  type AuditPage,
  type AuditQuery,
  type PlatformPerson,
  type WorkspaceDetail,
  type WorkspacePage,
  type WorkspacesQuery,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AuditLog, supportActor } from '../audit/audit-log.js';
import { AuthService } from '../auth/auth.service.js';
import { pageOfLog } from '../common/log-page.js';
import { notFound } from '../common/not-found.js';
import { DATABASE } from '../database/database.module.js';
import { EventBus } from '../events/event-bus.js';
import { StaffAudit, type StaffActor } from './staff-audit.js';

/**
 * Every workspace and person, for Dossier's staff. Lists cross workspaces
 * through the platform repository; one workspace's details come from the
 * same repositories the workspace itself uses. Each change is written to
 * the staff log, and to the workspace's own audit log while it exists.
 */
@Injectable()
export class PlatformService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly audit: AuditLog,
    private readonly auth: AuthService,
    private readonly events: EventBus,
    private readonly log: StaffAudit,
  ) {}

  async workspaces({
    q,
    status,
    page,
  }: WorkspacesQuery): Promise<WorkspacePage> {
    const { data, total } = await this.db.platform.workspaces({
      search: q,
      status,
      limit: WORKSPACE_PAGE_SIZE,
      offset: (page - 1) * WORKSPACE_PAGE_SIZE,
    });
    return { data, total, page, pageSize: WORKSPACE_PAGE_SIZE };
  }

  async workspace(id: string): Promise<WorkspaceDetail> {
    const [workspace, members, invites, connectors, reports] =
      await Promise.all([
        this.db.platform.workspace(id),
        this.db.platform.people({ workspaceId: id, limit: 1000 }),
        this.db.invites.list(id),
        this.db.connectors.list(id),
        this.db.reports.listSummaries(id),
      ]);
    if (!workspace) notFound('Workspace', id);
    const count = (status: string) =>
      reports.filter((report) => report.status === status).length;
    return {
      workspace,
      members,
      invites,
      connectors,
      reports: {
        draft: count('draft'),
        approved: reports.filter((r) => r.status === 'approved' && !r.sentAt)
          .length,
        sent: reports.filter((r) => r.sentAt).length,
      },
    };
  }

  /** The workspace's own audit log, everything in it, a page at a time. */
  async auditLog(
    id: string,
    { before, after, limit, ...filter }: AuditQuery,
  ): Promise<AuditPage> {
    await this.summaryOf(id);
    return pageOfLog(
      (window) => this.db.audit.list(id, { ...filter, ...window }),
      { before, after, limit },
      'That page of the audit log isn’t valid. Start from the newest entries.',
    );
  }

  /** Nobody can sign in, and nothing syncs, drafts or sends, until restored. */
  async suspend(
    staff: StaffActor,
    id: string,
    reason: string,
    ip: string | null,
  ) {
    const workspace = await this.summaryOf(id);
    if (workspace.suspension) {
      throw new ConflictException('This workspace is already suspended.');
    }
    await this.db.platform.suspend(id, reason, new Date().toISOString());
    await this.audit.record(id, supportActor(staff), {
      kind: 'change',
      what: `Suspended the workspace: ${reason}`,
    });
    await this.log.record(staff, {
      what: `Suspended ${workspace.name}: ${reason}`,
      workspaceId: id,
      ip,
    });
  }

  async restore(staff: StaffActor, id: string, ip: string | null) {
    const workspace = await this.summaryOf(id);
    if (!workspace.suspension) {
      throw new ConflictException('This workspace isn’t suspended.');
    }
    await this.db.platform.restore(id);
    // Reports approved before now wait for Send now, rather than all going
    // out the moment the schedule next looks.
    const settings = await this.db.reportSettings.get(id);
    if (settings?.sendAt) {
      await this.db.reportSettings.save(id, {
        ...settings,
        sendFrom: new Date().toISOString(),
      });
    }
    await this.audit.record(id, supportActor(staff), {
      kind: 'change',
      what: 'Restored the workspace',
    });
    await this.log.record(staff, {
      what: `Restored ${workspace.name}`,
      workspaceId: id,
      ip,
    });
  }

  /**
   * Deletes the workspace, everything in it, and the accounts left in no
   * workspace. Only once it's suspended, and with its name typed out.
   */
  async remove(
    staff: StaffActor,
    id: string,
    confirmName: string,
    ip: string | null,
  ) {
    const workspace = await this.summaryOf(id);
    if (!workspace.suspension) {
      throw new ConflictException(
        'Suspend the workspace before deleting it, so nobody is using it.',
      );
    }
    if (confirmName.trim() !== workspace.name) {
      throw new BadRequestException(
        `Type the workspace’s name, ${workspace.name}, exactly, to delete it.`,
      );
    }
    await this.db.platform.remove(id);
    await this.log.record(staff, {
      what: `Deleted ${workspace.name} (${workspace.members} ${workspace.members === 1 ? 'person' : 'people'}, ${workspace.clients} ${workspace.clients === 1 ? 'client' : 'clients'})`,
      workspaceId: id,
      ip,
    });
  }

  // People ----------------------------------------------------------------------

  people(q: string): Promise<PlatformPerson[]> {
    return this.db.platform.people({ search: q, limit: 50 });
  }

  async person(id: string): Promise<PlatformPerson> {
    const [person] = await this.db.platform.people({ userId: id, limit: 1 });
    if (!person) notFound('Person', id);
    return person;
  }

  /** Ends every session they have, everywhere. */
  async signOut(staff: StaffActor, id: string, ip: string | null) {
    const person = await this.person(id);
    await this.db.sessions.deleteForUser(id);
    await this.recordFor(
      staff,
      person,
      `Signed ${person.name} out everywhere`,
      ip,
    );
  }

  /** Emails them a link to choose a new password. 502 if it can't be sent. */
  async sendPasswordReset(staff: StaffActor, id: string, ip: string | null) {
    const person = await this.person(id);
    await this.refuseWhileSuspended(person);
    const user = await this.db.users.get(id);
    if (!user) notFound('Person', id);
    try {
      await this.auth.mailResetLink(user);
    } catch {
      throw new BadGatewayException(
        'Dossier couldn’t email the reset link. Try again shortly.',
      );
    }
    await this.recordFor(
      staff,
      person,
      `Emailed ${person.name} a password reset link`,
      ip,
    );
  }

  /**
   * Turns off their two-factor sign-in, for someone who lost their phone and
   * recovery codes. They're told, in Dossier and by email.
   */
  async turnOffTwoFactor(staff: StaffActor, id: string, ip: string | null) {
    const person = await this.person(id);
    if (!person.twoFactor) {
      throw new ConflictException(`${person.name} doesn’t have two-factor on.`);
    }
    await this.db.mfa.remove(id);
    await this.recordFor(
      staff,
      person,
      `Turned off two-factor sign-in for ${person.name}`,
      ip,
    );
    if (person.workspace) {
      await this.events.publish(person.workspace.id, null, {
        type: 'security.two-factor-off',
        userId: id,
      });
    }
  }

  private async summaryOf(id: string) {
    const workspace = await this.db.platform.workspace(id);
    if (!workspace) notFound('Workspace', id);
    return workspace;
  }

  private async refuseWhileSuspended(person: PlatformPerson) {
    if (
      person.workspace &&
      (await this.db.workspaces.suspension(person.workspace.id))
    ) {
      throw new ConflictException(
        `${person.workspace.name} is suspended. Restore it first.`,
      );
    }
  }

  /** To the staff log, and the person's workspace's own log. */
  private async recordFor(
    staff: StaffActor,
    person: PlatformPerson,
    what: string,
    ip: string | null,
  ) {
    if (person.workspace) {
      await this.audit.record(person.workspace.id, supportActor(staff), {
        kind: 'sign-in',
        what,
      });
    }
    await this.log.record(staff, {
      what: person.workspace ? `${what} (${person.workspace.name})` : what,
      workspaceId: person.workspace?.id ?? null,
      userId: person.id,
      ip,
    });
  }
}
