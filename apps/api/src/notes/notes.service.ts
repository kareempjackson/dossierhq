import type {
  MeetingNote,
  Member,
  NotesInbox,
  newMeetingNoteSchema,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { AuditLog } from '../audit/audit-log.js';
import { RateLimits } from '../auth/rate-limits.js';
import { notFound } from '../common/not-found.js';
import type { AppConfig, InboundConfig } from '../config/configuration.js';
import { DATABASE } from '../database/database.module.js';
import { IntelligenceScheduler } from '../intelligence/scheduler.js';
import { ClientDirectory } from '../integrations/directory.js';
import { domainOf } from '../integrations/ids.js';
import {
  bodyOf,
  dayOf,
  domainsIn,
  inboxTokenOf,
  titleOf,
  type PostmarkInbound,
} from './inbound-email.js';
import { noteSource } from './note-source.js';

type NewNote = z.output<typeof newMeetingNoteSchema>;

/** Notes as they arrive: nothing read from them yet. */
const UNREAD = { planning: [], concerns: [], askedFor: [], readAt: null };

/**
 * Meeting notes people add themselves: pasted in, or forwarded to the
 * workspace's address. Notes no client claims wait in the inbox.
 */
@Injectable()
export class NotesService {
  private readonly inbound: InboundConfig | null;
  private readonly webUrl: string;

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly audit: AuditLog,
    private readonly limits: RateLimits,
    private readonly intelligence: IntelligenceScheduler,
    config: ConfigService<AppConfig, true>,
  ) {
    this.inbound = config.get('inbound', { infer: true });
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  list(workspaceId: string, clientId: string): Promise<MeetingNote[]> {
    return this.db.notes.list(workspaceId, clientId);
  }

  /** The waiting notes, and the address to forward more to. */
  async inbox(workspaceId: string): Promise<NotesInbox> {
    const [notes, address] = await Promise.all([
      this.db.notes.list(workspaceId, null),
      this.address(workspaceId),
    ]);
    return { address, notes };
  }

  async add(
    workspaceId: string,
    userId: string,
    input: NewNote,
  ): Promise<MeetingNote> {
    if (input.clientId) await this.requireClient(workspaceId, input.clientId);
    const user = await this.db.users.get(userId);
    const note: MeetingNote = {
      id: `note-${randomUUID()}`,
      clientId: input.clientId,
      title: input.title || 'Meeting notes',
      occurredOn: input.occurredOn,
      attendees: input.attendees,
      body: input.body,
      via: 'paste',
      addedBy: { userId, name: user?.name ?? 'Someone' },
      createdAt: new Date().toISOString(),
      ...UNREAD,
    };
    await this.save(workspaceId, note);
    await this.audit.record(workspaceId, user ?? userId, {
      kind: 'change',
      clientId: note.clientId,
      what: `Added the meeting notes “${note.title}”${note.clientId ? '' : ' to the inbox'}`,
    });
    return note;
  }

  /** Files notes with a client, or with null puts them back in the inbox. */
  async file(
    workspaceId: string,
    userId: string,
    id: string,
    clientId: string | null,
  ): Promise<MeetingNote> {
    if (clientId) await this.requireClient(workspaceId, clientId);
    const before =
      (await this.db.notes.get(workspaceId, id)) ?? notFound('Notes', id);
    const note =
      (await this.db.notes.file(
        workspaceId,
        id,
        clientId,
        this.sourceOf({ ...before, clientId }),
      )) ?? notFound('Notes', id);
    if (clientId) this.intelligence.soon(workspaceId);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      clientId: clientId ?? before.clientId,
      what: clientId
        ? `Filed the meeting notes “${note.title}”`
        : `Moved the meeting notes “${note.title}” back to the inbox`,
    });
    return note;
  }

  async remove(workspaceId: string, userId: string, id: string) {
    const note =
      (await this.db.notes.get(workspaceId, id)) ?? notFound('Notes', id);
    await this.db.notes.remove(workspaceId, id);
    await this.audit.record(workspaceId, userId, {
      kind: 'change',
      clientId: note.clientId,
      what: `Deleted the meeting notes “${note.title}”`,
    });
  }

  /**
   * Adds notes someone forwarded to a workspace's address, filed with the
   * one client its addresses point to, else in the inbox. Email from anyone
   * outside the workspace is dropped, and logged.
   */
  async receive(email: PostmarkInbound): Promise<'added' | 'ignored'> {
    const token = inboxTokenOf(email);
    const workspaceId = token && (await this.db.notes.inboxWorkspace(token));
    if (!workspaceId) return 'ignored';

    const from = email.FromFull.Email.trim().toLowerCase();
    const [workspace, members] = await Promise.all([
      this.db.workspaces.get(workspaceId),
      this.db.users.members(workspaceId),
    ]);
    const sender = members.find((m) => m.email.toLowerCase() === from);
    if (!workspace || !sender) {
      await this.audit.record(workspaceId, null, {
        kind: 'change',
        what: `Ignored notes emailed from ${from}, who isn’t in this workspace`,
        outcome: 'failed',
      });
      return 'ignored';
    }
    const body = bodyOf(email);
    const title = titleOf(email.Subject);
    if (!body || (await this.limits.blocked(['notes-inbox', workspaceId]))) {
      await this.audit.record(workspaceId, sender, {
        kind: 'change',
        what: body
          ? `Emailed the meeting notes “${title}”, but too many came in this hour`
          : `Emailed the meeting notes “${title}”, but they were empty`,
        outcome: 'failed',
      });
      return 'ignored';
    }
    await this.limits.hit(['notes-inbox', workspaceId]);

    const now = new Date();
    const note: MeetingNote = {
      id: `note-${randomUUID()}`,
      clientId: await this.clientFor(workspaceId, email, members),
      title,
      occurredOn: dayOf(email.Date, workspace.timeZone, now),
      attendees: [],
      body,
      via: 'email',
      addedBy: { userId: sender.id, name: sender.name },
      createdAt: now.toISOString(),
      ...UNREAD,
    };
    await this.save(workspaceId, note);
    await this.audit.record(workspaceId, sender, {
      kind: 'change',
      clientId: note.clientId,
      what: `Emailed the meeting notes “${title}”${note.clientId ? '' : ' to the inbox'}`,
    });
    return 'added';
  }

  /** Adds notes, citable once filed; Claude reads them soon after. */
  private async save(workspaceId: string, note: MeetingNote) {
    await this.db.notes.add(workspaceId, note, this.sourceOf(note));
    if (note.clientId) this.intelligence.soon(workspaceId);
  }

  /** What cites filed notes whole; nothing cites notes in the inbox. */
  private sourceOf(note: MeetingNote) {
    const { clientId } = note;
    return clientId ? noteSource({ ...note, clientId }, this.webUrl) : null;
  }

  /** The address to forward to; null until inbound email is set up. */
  private async address(workspaceId: string): Promise<string | null> {
    if (!this.inbound) return null;
    const token = await this.db.notes.inboxToken(
      workspaceId,
      randomBytes(10).toString('hex'),
      new Date().toISOString(),
    );
    const at = this.inbound.address.lastIndexOf('@');
    return `${this.inbound.address.slice(0, at)}+${token}${this.inbound.address.slice(at)}`;
  }

  /**
   * The one client the email's addresses point to, matched as meetings are;
   * null when none does, or more than one, so someone files it by hand.
   */
  private async clientFor(
    workspaceId: string,
    email: PostmarkInbound,
    members: Member[],
  ): Promise<string | null> {
    const own = new Set([
      ...members.map((m) => domainOf(m.email)),
      domainOf(this.inbound?.address),
    ]);
    const domains = domainsIn(email).filter((d) => !own.has(d));
    if (domains.length === 0) return null;
    const [clients, links] = await Promise.all([
      this.db.clients.list(workspaceId),
      this.db.clients.links(workspaceId),
    ]);
    const lookup = new ClientDirectory(workspaceId, clients, links).lookup(
      'fathom',
    );
    const matched = new Set(
      domains.map((domain) => lookup.forDomains([domain])).filter(Boolean),
    );
    return matched.size === 1 ? [...matched][0]! : null;
  }

  private async requireClient(workspaceId: string, clientId: string) {
    if (!(await this.db.clients.get(workspaceId, clientId))) {
      notFound('Client', clientId);
    }
  }
}
