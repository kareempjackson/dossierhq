import type {
  AttentionItem,
  CitedText,
  Client,
  Device,
  Meeting,
  MeetingNote,
  Recommendation,
  Source,
  Ticket,
  Urgency,
} from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS } from '../integrations/ids.js';
import {
  clean,
  ContextPacks,
  day,
  HandleBook,
  recordOf,
  type SharedRecords,
} from './pack.js';

/** Everything across the workspace a digest is built from. */
export type DigestInput = {
  clients: Client[];
  attention: AttentionItem[];
  recommendations: Recommendation[];
  meetings: Meeting[];
  notes: MeetingNote[];
  tickets: Ticket[];
  devices: Device[];
  /** Every client's sources. */
  sources: Source[];
};

/** The workspace's records as text a model can read and cite. */
export type WorkspaceDigest = {
  text: string;
  hash: string;
  /** Maps the digest's handles back to sources, each with its client. */
  book: HandleBook;
};

/** What each client's section shows at most. */
const LIMITS = {
  attention: 5,
  recommendations: 3,
  said: 4,
  tickets: 5,
  devices: 3,
  expiring: 5,
};
/** What clients said in meetings counts for this long. */
const SAID_DAYS = 60;
/** Expiry dates this close are worth mentioning. */
const EXPIRING_DAYS = 60;
/** The longest digest, in characters: about 100k tokens. */
const MAX_CHARS = 400_000;

/** Operating systems past the end of their support. */
const UNSUPPORTED = [
  /\bWindows (?:XP|Vista|7|8(?:\.1)?|10)\b/i,
  /\bWindows Server 20(?:03|08|12)\b/i,
];

const urgencyRank: Record<Urgency, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every client's headline records in one text, for finding what several of
 * them share. Built only from what changes when something real does: days,
 * not times; never when a record was last synced or updated; and in orders
 * that don't depend on either. So its hash stays put between syncs.
 */
export function buildWorkspaceDigest(
  input: DigestInput,
  now: Date,
  shared: SharedRecords,
): WorkspaceDigest {
  const book = new HandleBook();
  const today = now.getTime();
  const ticketSources = new Set(input.tickets.map((t) => t.sourceId));
  const sourceById = new Map(input.sources.map((s) => [s.id, s]));
  /** The item's sources, or null when it has none or rests on withheld ones. */
  const readable = (ids: string[]): Source[] | null => {
    const sources = ids.flatMap((id) => sourceById.get(id) ?? []);
    return sources.length > 0 &&
      sources.every((s) => shared[recordOf(s, ticketSources)])
      ? sources
      : null;
  };
  const of = <T extends { clientId: string | null }>(items: T[], id: string) =>
    items.filter((item) => item.clientId === id);

  const sections = input.clients.map((client) => {
    const lines: string[] = [];
    // Numbered later, in the order the sections end up in.
    const cite: { at: number; sources: Source[] }[] = [];
    const line = (sources: Source[], text: string) => {
      cite.push({ at: lines.length, sources });
      lines.push(text);
    };

    for (const a of of(input.attention, client.id)
      .flatMap((a) => {
        const sources = readable(a.sourceIds);
        return sources ? [{ a, sources }] : [];
      })
      .slice(0, LIMITS.attention)) {
      line(
        a.sources,
        `Flagged: ${a.a.urgency} ${a.a.kind}: ${clean(a.a.title)} (raised ${day(a.a.raisedAt)})`,
      );
    }

    // Accepted ones only: drafts are reworded with every run.
    for (const r of of(input.recommendations, client.id)
      .filter((r) => r.status === 'accepted')
      .flatMap((r) => {
        const sources = readable(r.sourceIds);
        return sources ? [{ r, sources }] : [];
      })
      .slice(0, LIMITS.recommendations)) {
      line(r.sources, `Accepted recommendation: ${clean(r.r.title)}`);
    }

    const said = [
      ...(shared.meetings ? of(input.meetings, client.id) : []).map((m) => ({
        on: day(m.occurredAt),
        points: m,
      })),
      ...(shared.notes ? of(input.notes, client.id) : []).map((n) => ({
        on: n.occurredOn,
        points: n,
      })),
    ]
      .filter(({ on }) => today - Date.parse(on) <= SAID_DAYS * DAY_MS)
      .sort((a, b) => compare(b.on, a.on))
      .flatMap(({ on, points }) =>
        (
          [
            ['concern', points.concerns],
            ['asked for', points.askedFor],
            ['planning', points.planning],
          ] as [string, CitedText[]][]
        ).flatMap(([label, texts]) =>
          texts.flatMap((t) => {
            const sources = readable(t.sourceIds);
            return sources ? [{ on, label, text: t.text, sources }] : [];
          }),
        ),
      )
      .slice(0, LIMITS.said);
    for (const s of said) {
      line(s.sources, `Client said (${s.label}, ${s.on}): ${clean(s.text)}`);
    }

    if (shared.tickets) {
      const open = of(input.tickets, client.id)
        .filter((t) => t.open)
        .sort(
          (a, b) =>
            urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
            compare(b.openedAt, a.openedAt) ||
            compare(a.number, b.number),
        );
      if (open.length > 0) {
        const count = (u: Urgency) =>
          open.filter((t) => t.urgency === u).length;
        const shown = open.slice(0, LIMITS.tickets);
        line(
          shown.flatMap((t) => sourceById.get(t.sourceId) ?? []),
          `Open tickets: ${open.length} (${count('critical')} critical, ${count('high')} high). Most urgent: ${shown
            .map(
              (t) =>
                `"${clean(t.subject, 120)}" (${t.urgency}, opened ${day(t.openedAt)})`,
            )
            .join('; ')}`,
        );
      }
    }

    if (shared.devices) {
      const devices = of(input.devices, client.id);
      const sourcesOf = (list: Device[]) =>
        list
          .slice(0, LIMITS.devices)
          .flatMap((d) => sourceById.get(d.sourceId) ?? []);
      // Failed only: pending comes and goes with every patch cycle.
      const failed = devices.filter((d) => d.patchStatus === 'failed');
      if (failed.length > 0) {
        line(
          sourcesOf(failed),
          `Patching failed on ${failed.length} of ${devices.length} devices (${failed
            .slice(0, LIMITS.devices)
            .map((d) => clean(d.name))
            .join(', ')})`,
        );
      }
      const unsupported = new Map<string, Device[]>();
      for (const d of devices) {
        const os = UNSUPPORTED.map((pattern) => pattern.exec(d.os)?.[0]).find(
          Boolean,
        );
        if (os) unsupported.set(os, [...(unsupported.get(os) ?? []), d]);
      }
      for (const [os, list] of [...unsupported].sort(([a], [b]) =>
        compare(a, b),
      )) {
        line(
          sourcesOf(list),
          `Out of support: ${os} on ${list.length} device${list.length === 1 ? '' : 's'} (${list
            .slice(0, LIMITS.devices)
            .map((d) => clean(d.name))
            .join(', ')})`,
        );
      }
      const offline = devices.filter(
        (d) =>
          d.type === 'server' && today - Date.parse(d.lastSeenAt) >= DAY_MS,
      );
      if (offline.length > 0) {
        line(
          sourcesOf(offline),
          `Servers offline: ${offline
            .slice(0, LIMITS.devices)
            .map((d) => `${clean(d.name)} since ${day(d.lastSeenAt)}`)
            .join(', ')}`,
        );
      }
    }

    if (shared.documentation) {
      const expiring = input.sources
        .filter(
          (s) =>
            s.clientId === client.id &&
            s.tool === 'hudu' &&
            s.recordType === 'Expiration',
        )
        .flatMap((s) => {
          const on = s.fields.find((f) => f.label === 'Date')?.value ?? '';
          const due = Date.parse(`${on}T00:00:00Z`);
          const days = (due - today) / DAY_MS;
          return days >= -1 && days <= EXPIRING_DAYS
            ? [{ s, on, what: s.fields.find((f) => f.label === 'Type')?.value }]
            : [];
        })
        .sort((a, b) => compare(a.on, b.on) || compare(a.s.id, b.s.id))
        .slice(0, LIMITS.expiring);
      for (const e of expiring) {
        const target = e.s.fields.find((f) => f.label === 'For')?.value;
        line(
          [e.s],
          `Expires: ${clean(e.what ?? 'Expiry')}${target ? ` for ${clean(target)}` : ''} on ${e.on}`,
        );
      }
    }

    return { client, lines, cite };
  });

  // The busiest clients first when there's too much, then all by name.
  const sized = sections
    .filter((s) => s.lines.length > 0)
    .map((s) => ({
      ...s,
      chars: s.lines.reduce((sum, l) => sum + l.length + 12, 40),
    }));
  const kept = new Set<string>();
  let total = 0;
  for (const s of [...sized].sort(
    (a, b) =>
      b.lines.length - a.lines.length || compare(a.client.name, b.client.name),
  )) {
    if (total + s.chars > MAX_CHARS) continue;
    kept.add(s.client.id);
    total += s.chars;
  }
  const shown = sized
    .filter((s) => kept.has(s.client.id))
    .sort((a, b) => compare(a.client.name, b.client.name));

  const text = [
    '<workspace_records>',
    ...shown.flatMap((s) => [
      '',
      `# ${clean(s.client.name)} (${s.client.id})`,
      ...s.lines.map((text, at) => {
        const sources = s.cite.find((c) => c.at === at)?.sources ?? [];
        return `- ${book.cite(sources)}${text}`;
      }),
    ]),
    ...(sized.length > shown.length
      ? ['', `(${sized.length - shown.length} quieter clients left out)`]
      : []),
    ...(input.clients.length > sized.length
      ? [
          '',
          `(${input.clients.length - sized.length} more clients have nothing to report)`,
        ]
      : []),
    '</workspace_records>',
  ].join('\n');
  return { text, hash: createHash('sha256').update(text).digest('hex'), book };
}

/** Builds the workspace's digest from the database. */
@Injectable()
export class WorkspaceDigests {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    private readonly packs: ContextPacks,
  ) {}

  async build(workspaceId: string): Promise<WorkspaceDigest> {
    const clients = await this.db.clients.list(workspaceId);
    const [
      shared,
      attention,
      recommendations,
      meetings,
      tickets,
      devices,
      notes,
      sources,
    ] = await Promise.all([
      this.packs.shared(workspaceId),
      this.db.attention.list(workspaceId),
      this.db.recommendations.list(workspaceId),
      this.db.meetings.list(workspaceId),
      this.db.tickets.list(workspaceId),
      this.db.devices.list(workspaceId),
      Promise.all(
        clients.map((c) => this.db.notes.list(workspaceId, c.id)),
      ).then((lists) => lists.flat()),
      Promise.all(
        clients.map((c) => this.db.sources.listForClient(workspaceId, c.id)),
      ).then((lists) => lists.flat()),
    ]);
    return buildWorkspaceDigest(
      {
        clients,
        attention,
        recommendations,
        meetings,
        notes,
        tickets,
        devices,
        sources,
      },
      new Date(),
      shared,
    );
  }
}
