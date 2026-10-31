import type { SupportGrant, SupportSession } from '@dossierhq/contracts';
import type { DatabaseAdapter, SupportGrantRecord } from '@dossierhq/database';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuditLog, supportActor } from '../audit/audit-log.js';
import { notFound } from '../common/not-found.js';
import type { SupportView } from '../common/workspace.js';
import type { AppConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { roleIn } from './roles.js';
import { hashToken } from './token-hash.js';

/**
 * Support views' session tokens start with this. `.` never appears in
 * base64url, so no ordinary session token can look like one.
 */
const PREFIX = 'sup.';
/** How long the one-time link works. */
const HANDOFF_MS = 2 * 60_000;
/** How often views that ran out are ended and logged. */
const SWEEP_EVERY_MS = 60_000;

export const isSupportToken = (token: string) => token.startsWith(PREFIX);

const unusableLink = () =>
  new BadRequestException(
    'This support link has expired, was already used, or the view has ended. Open a new one from Dossier Admin.',
  );

type Staff = { id: string; name: string; email: string };

/** A grant without its hashes, as staff see it. */
function publicGrant({
  staffId: _staff,
  actingUserId: _acting,
  handoffHash: _handoff,
  handoffExpiresAt: _until,
  sessionHash: _session,
  ...grant
}: SupportGrantRecord): SupportGrant {
  return grant;
}

/**
 * Read-only support views: a member of staff sees a workspace as its owner
 * does, for at most an hour, with the reason in the workspace's own audit
 * log. The admin app hands over a one-time link; opening it swaps it for a
 * session in the customer app. AuthGuard sends support tokens here, and lets
 * them read and nothing else. Everything runs on real time.
 */
@Injectable()
export class SupportAccess implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportAccess.name);
  private readonly webUrl: string;
  private sweeper: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly audit: AuditLog,
    config: ConfigService<AppConfig, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  onModuleInit() {
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  /** Opens a view: the grant, and the one-time link to the customer app. */
  async open(
    staff: Staff,
    workspace: { id: string; name: string },
    reason: string,
    minutes: number,
  ): Promise<{ grant: SupportGrant; url: string }> {
    const now = Date.now();
    const token = randomBytes(32).toString('base64url');
    const grant: SupportGrantRecord = {
      id: `sup-${randomUUID()}`,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      staff: { name: staff.name, email: staff.email },
      reason,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + minutes * 60_000).toISOString(),
      openedAt: null,
      endedAt: null,
      endedBy: null,
      staffId: staff.id,
      actingUserId: null,
      handoffHash: hashToken(token),
      handoffExpiresAt: new Date(now + HANDOFF_MS).toISOString(),
      sessionHash: null,
    };
    await this.db.supportGrants.create(grant);
    await this.audit.record(workspace.id, supportActor(staff), {
      kind: 'sign-in',
      what: `Opened a read-only support view for ${minutes} minutes: ${reason}`,
    });
    const url = new URL('/support', this.webUrl);
    url.searchParams.set('token', token);
    return { grant: publicGrant(grant), url: url.href };
  }

  /**
   * Swaps a one-time link for the view's session, acting as an owner of the
   * workspace. 400 when the link can't be used.
   */
  async redeem(token: string): Promise<SupportSession> {
    const now = new Date().toISOString();
    const handoffHash = hashToken(token);
    const grant = await this.db.supportGrants.findByHandoff(handoffHash);
    if (
      !grant ||
      grant.endedAt ||
      grant.handoffExpiresAt <= now ||
      grant.expiresAt <= now
    ) {
      throw unusableLink();
    }
    const owner = await this.ownerOf(grant.workspaceId);
    if (!owner) {
      throw new ConflictException('This workspace has no owner to view it as.');
    }
    const session = randomBytes(32).toString('base64url');
    const redeemed = await this.db.supportGrants.redeem(
      grant.id,
      handoffHash,
      hashToken(session),
      owner.id,
      now,
    );
    if (!redeemed) throw unusableLink();
    await this.audit.record(grant.workspaceId, supportActor(grant.staff), {
      kind: 'sign-in',
      what: `Started the read-only support view, as ${owner.name}`,
    });
    return { token: `${PREFIX}${session}`, expiresAt: grant.expiresAt };
  }

  /**
   * Who a support token acts as, and where, or null when the view ended,
   * ran out, or never was. Its workspace may be suspended: views still open.
   */
  async authenticate(token: string): Promise<{
    userId: string;
    workspaceId: string;
    support: SupportView;
  } | null> {
    const grant = await this.live(token);
    if (!grant) return null;
    let userId = grant.actingUserId;
    // The owner it acted as may have left, or stopped being an owner.
    if (
      !userId ||
      (await roleIn(this.db, userId, grant.workspaceId)) !== 'owner'
    ) {
      userId = (await this.ownerOf(grant.workspaceId))?.id ?? null;
      if (!userId) return null;
      await this.db.supportGrants.setActingUser(grant.id, userId);
    }
    return {
      userId,
      workspaceId: grant.workspaceId,
      support: {
        grantId: grant.id,
        staffName: grant.staff.name,
        endsAt: grant.expiresAt,
      },
    };
  }

  /** Ends a view from inside it: End support view, or signing out. */
  async endFromView(token: string): Promise<void> {
    const grant = await this.live(token);
    if (!grant) return;
    await this.finish(grant, grant.staff.name);
  }

  /** Ends a view from the admin app. 404 for no such view; 409 if it ended. */
  async end(id: string, staff: Staff): Promise<SupportGrant> {
    const grant = await this.db.supportGrants.get(id);
    if (!grant) notFound('Support view', id);
    if (grant.endedAt || grant.expiresAt <= new Date().toISOString()) {
      throw new ConflictException('This support view has already ended.');
    }
    return this.finish(grant, staff.name);
  }

  /** Newest first: one workspace's views, or every one running now. */
  list(query: { workspaceId?: string; live?: boolean; limit: number }) {
    return this.db.supportGrants.list({
      workspaceId: query.workspaceId,
      liveAt: query.live ? new Date().toISOString() : undefined,
      limit: query.limit,
    });
  }

  private async live(token: string): Promise<SupportGrantRecord | null> {
    if (!isSupportToken(token)) return null;
    const grant = await this.db.supportGrants.findBySession(
      hashToken(token.slice(PREFIX.length)),
    );
    if (!grant || grant.endedAt) return null;
    return grant.expiresAt > new Date().toISOString() ? grant : null;
  }

  private async finish(
    grant: SupportGrantRecord,
    by: string,
  ): Promise<SupportGrant> {
    const at = new Date().toISOString();
    if (!(await this.db.supportGrants.end(grant.id, at, by))) {
      throw new ConflictException('This support view has already ended.');
    }
    await this.audit.record(grant.workspaceId, supportActor(grant.staff), {
      kind: 'sign-in',
      what:
        by === grant.staff.name
          ? 'Ended the read-only support view'
          : `The read-only support view was ended by ${by}`,
    });
    return { ...publicGrant(grant), endedAt: at, endedBy: by };
  }

  /** Ends and logs the views that ran out, which no request will. */
  private async sweep() {
    try {
      const ended = await this.db.supportGrants.endExpired(
        new Date().toISOString(),
      );
      for (const grant of ended) {
        await this.audit.record(grant.workspaceId, supportActor(grant.staff), {
          kind: 'sign-in',
          what: 'The read-only support view ended: its time ran out',
        });
      }
    } catch (error) {
      this.logger.warn(
        `Couldn’t end support views that ran out: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** An owner of the workspace, first by name. */
  private async ownerOf(workspaceId: string) {
    return (
      (await this.db.users.members(workspaceId)).find(
        (member) => member.role === 'owner',
      ) ?? null
    );
  }
}
