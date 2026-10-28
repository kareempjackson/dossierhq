import {
  INTELLIGENCE_RECORDS,
  intelligencePreferencesSchema,
  SUMMARY_FIELD,
  TOOL_NAMES,
  type IntelligencePreferences,
  type IntelligenceRecord,
  type AttentionItem,
  type Client,
  type Commitment,
  type Connector,
  type Device,
  type Meeting,
  type Source,
  type Ticket,
} from '@dossierhq/contracts';
import type { ClientLink, DatabaseAdapter } from '@dossierhq/database';
import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DATABASE } from '../database/database.module.js';
import { DAY_MS, oneLine } from '../integrations/ids.js';

/**
 * One client's records as text a model can read and cite: every fact carries
 * handles like [S3] that map back to stored sources. Built the same way every
 * time from the same records, so its hash says whether anything changed.
 */
export type ClientPack = {
  clientId: string;
  text: string;
  hash: string;
  /** Handles (`S3`, `[S3]`) to source IDs, in order, dropping unknown ones. */
  sourceIds(handles: string[]): string[];
};

/** Everything a pack is built from. Each list in its repository's order. */
export type PackInput = {
  client: Client;
  links: ClientLink[];
  attention: AttentionItem[];
  commitments: Commitment[];
  meetings: Meeting[];
  devices: Device[];
  tickets: Ticket[];
  sources: Source[];
  connectors: Connector[];
};

/** At most this many lines per section; the rest are counted. */
const LIMITS = {
  attention: 40,
  commitments: 30,
  meetings: 6,
  openTickets: 40,
  closedTickets: 20,
  devices: 40,
  documentation: 40,
  files: 15,
  other: 30,
};
const SUMMARY_CHARS = 2_500;
/** Closed tickets and other records older than this are left out. */
const RECENT_DAYS = 30;
/** A device not seen for this long is stale. Servers: a day. */
const STALE_DAYS = 30;

/** Labels that suggest a secret; such fields never reach a model. */
const SENSITIVE = /pass|secret|key|pin|token|credential|otp|recovery/i;

const day = (iso: string) => iso.slice(0, 10);
/** Synced text, made safe to sit inside the records tag. */
const clean = (text: string, max?: number) =>
  oneLine(text.replace(/<\/?client_records>/gi, ''), max);

/** Which kinds of record the workspace shares with Claude. */
export type SharedRecords = IntelligencePreferences['records'];

const SHARE_EVERYTHING: SharedRecords = intelligencePreferencesSchema.parse(
  {},
).records;

/** Which kind of record a source is, for the workspace's sharing choices. */
function recordOf(
  source: Source,
  ticketSources: Set<string>,
): IntelligenceRecord {
  switch (source.tool) {
    case 'fathom':
      return 'meetings';
    case 'hudu':
      return 'documentation';
    case 'sharepoint':
      return 'files';
    case 'ninjaone':
      return ticketSources.has(source.id) || source.recordType === 'Ticket'
        ? 'tickets'
        : 'devices';
  }
}

/**
 * The input without the kinds of record the workspace keeps from Claude, and
 * without anything that cites them, since its wording could give them away.
 */
function withhold(input: PackInput, shared: SharedRecords): PackInput {
  const ticketSources = new Set(input.tickets.map((t) => t.sourceId));
  const kept = (s: Source) => shared[recordOf(s, ticketSources)];
  const withheld = new Set(
    input.sources.filter((s) => !kept(s)).map((s) => s.id),
  );
  if (withheld.size === 0 && Object.values(shared).every(Boolean)) {
    return input;
  }
  const clear = (item: { sourceIds: string[] }) =>
    item.sourceIds.every((id) => !withheld.has(id));
  return {
    ...input,
    sources: input.sources.filter(kept),
    attention: input.attention.filter(clear),
    commitments: input.commitments.filter(clear),
    meetings: shared.meetings ? input.meetings : [],
    devices: shared.devices ? input.devices : [],
    tickets: shared.tickets ? input.tickets : [],
  };
}

export function buildClientPack(
  all: PackInput,
  now: Date,
  shared: SharedRecords = SHARE_EVERYTHING,
): ClientPack {
  const input = withhold(all, shared);
  const handles = new Map<string, string>();
  const bySource = new Map<string, string>();
  const known = new Set(input.sources.map((s) => s.id));
  const cited = new Set<string>();

  /** `[S1, S2]` for these sources, numbering each the first time it appears. */
  const cite = (...ids: string[]) => {
    const labels = ids
      .filter((id) => known.has(id))
      .map((id) => {
        cited.add(id);
        let label = bySource.get(id);
        if (!label) {
          label = `S${handles.size + 1}`;
          handles.set(label, id);
          bySource.set(id, label);
        }
        return label;
      });
    return labels.length > 0 ? `[${[...new Set(labels)].join(', ')}] ` : '';
  };

  const lines: string[] = [];
  const section = <T>(
    title: string,
    items: T[],
    limit: number,
    line: (item: T) => string,
    empty?: string,
  ) => {
    if (items.length === 0 && !empty) return;
    lines.push('', `## ${title}`);
    if (items.length === 0) lines.push(empty!);
    for (const item of items.slice(0, limit)) lines.push(`- ${line(item)}`);
    if (items.length > limit) lines.push(`- (+${items.length - limit} more)`);
  };

  const { client } = input;
  const today = now.getTime();
  const ageDays = (iso: string) => (today - Date.parse(iso)) / DAY_MS;

  // Profile ------------------------------------------------------------------
  lines.push(`# ${clean(client.name)}`);
  const profile = [
    client.industry && `Industry: ${clean(client.industry)}`,
    client.location && `Location: ${clean(client.location)}`,
    client.seats != null && `Seats: ${client.seats}`,
    client.primaryContact &&
      `Main contact: ${clean(client.primaryContact.name)} (${clean(client.primaryContact.role)})`,
    client.contract &&
      `Contract: ${clean(client.contract.plan)}, ${client.contract.monthlyFee} ${client.contract.currency} a month, renews ${client.contract.renewsOn}; includes ${client.contract.includes.map((i) => clean(i)).join(', ') || 'nothing listed'}`,
    client.domains.length > 0 && `Domains: ${client.domains.join(', ')}`,
    input.links.length > 0 &&
      `In the tools: ${input.links.map((l) => `${TOOL_NAMES[l.tool]} "${clean(l.name)}"`).join(', ')}`,
  ].filter(Boolean);
  for (const fact of profile) lines.push(`- ${fact}`);

  // Needs attention ----------------------------------------------------------
  section(
    'Needs attention now',
    input.attention,
    LIMITS.attention,
    (a) =>
      `${cite(...a.sourceIds)}${a.urgency} ${a.kind}: ${clean(a.title)} (raised ${day(a.raisedAt)})`,
    '- Nothing is flagged.',
  );

  // Commitments --------------------------------------------------------------
  section(
    'What the MSP promised the client',
    input.commitments,
    LIMITS.commitments,
    (c) =>
      `${cite(...c.sourceIds)}${clean(c.statement)} · promised ${day(c.madeAt)}` +
      (c.dueOn ? ` · due ${c.dueOn}` : '') +
      (c.status === 'done'
        ? ` · done${c.completedAt ? ` ${day(c.completedAt)}` : ''}`
        : ' · still open'),
  );

  // Meetings -----------------------------------------------------------------
  const sourceById = new Map(input.sources.map((s) => [s.id, s]));
  section('Recorded meetings', input.meetings, LIMITS.meetings, (m) => {
    const recording = sourceById.get(m.recordingSourceId);
    const summary = recording?.fields.find(
      (f) => f.label === SUMMARY_FIELD,
    )?.value;
    const people = m.attendees
      .map(
        (a) => `${clean(a.name)} (${a.role === 'client' ? 'client' : 'MSP'})`,
      )
      .join(', ');
    const points = [
      ...m.planning.map(
        (p) => `planning: ${cite(...p.sourceIds)}${clean(p.text)}`,
      ),
      ...m.concerns.map(
        (p) => `concern: ${cite(...p.sourceIds)}${clean(p.text)}`,
      ),
      ...m.askedFor.map(
        (p) => `asked for: ${cite(...p.sourceIds)}${clean(p.text)}`,
      ),
    ];
    return [
      `${cite(m.recordingSourceId)}${clean(m.title)} · ${day(m.occurredAt)} · ${m.durationMinutes} min · ${people || 'attendees unknown'}`,
      ...points.map((p) => `  - ${p}`),
      ...(summary ? [`  Summary: ${clean(summary, SUMMARY_CHARS)}`] : []),
    ].join('\n');
  });

  // Tickets ------------------------------------------------------------------
  const open = input.tickets.filter((t) => t.open);
  const closed = input.tickets.filter(
    (t) => !t.open && ageDays(t.updatedAt) <= RECENT_DAYS,
  );
  const ticketLine = (t: Ticket) =>
    `${cite(t.sourceId)}#${clean(t.number)} "${clean(t.subject, 200)}" · ${clean(t.status)} · ${t.urgency}` +
    (t.requester ? ` · from ${clean(t.requester)}` : '') +
    (t.assignedTo ? ` · with ${clean(t.assignedTo)}` : ' · unassigned') +
    ` · opened ${day(t.openedAt)}, updated ${day(t.updatedAt)}`;
  section('Open tickets', open, LIMITS.openTickets, ticketLine);
  section(
    `Tickets closed in the last ${RECENT_DAYS} days`,
    closed,
    LIMITS.closedTickets,
    ticketLine,
  );

  // Devices ------------------------------------------------------------------
  if (input.devices.length > 0) {
    const count = (match: (d: Device) => boolean) =>
      input.devices.filter(match).length;
    const types = {
      server: 'servers',
      workstation: 'workstations',
      laptop: 'laptops',
      network: 'network devices',
    } satisfies Record<Device['type'], string>;
    lines.push(
      '',
      '## Devices',
      `- ${input.devices.length} in all: ${Object.entries(types)
        .map(([type, plural]) => `${count((d) => d.type === type)} ${plural}`)
        .join(', ')}`,
      `- Patching: ${count((d) => d.patchStatus === 'current')} current, ${count((d) => d.patchStatus === 'pending')} pending, ${count((d) => d.patchStatus === 'failed')} failed`,
    );
    const problems = input.devices.flatMap((d) => {
      const seen = ageDays(d.lastSeenAt);
      const issues = [
        d.patchStatus === 'failed' && 'patching failed',
        d.patchStatus === 'pending' && 'patches pending',
        d.type === 'server' &&
          seen >= 1 &&
          `offline since ${day(d.lastSeenAt)}`,
        d.type !== 'server' &&
          seen >= STALE_DAYS &&
          `not seen since ${day(d.lastSeenAt)}`,
      ].filter(Boolean);
      return issues.length > 0 ? [{ device: d, issues }] : [];
    });
    section(
      'Devices with problems',
      problems,
      LIMITS.devices,
      ({ device: d, issues }) =>
        `${cite(d.sourceId)}${clean(d.name)} (${d.type}, ${clean(d.os)}${d.assignedTo ? `, used by ${clean(d.assignedTo)}` : ''}): ${issues.join(', ')}`,
    );
  }

  // Everything else, by tool ---------------------------------------------------
  const listed = new Set(cited);
  const rest = (match: (s: Source) => boolean) =>
    input.sources.filter((s) => !listed.has(s.id) && match(s));
  const recordLine = (s: Source) => {
    const fields = s.fields
      .filter(
        (f) =>
          f.label !== SUMMARY_FIELD &&
          f.value.trim() !== '' &&
          !SENSITIVE.test(f.label),
      )
      .slice(0, 6)
      .map((f) => `${clean(f.label, 40)}: ${clean(f.value, 120)}`);
    return `${cite(s.id)}${clean(s.recordType)}: ${clean(s.title)} · ${day(s.recordedAt)}${fields.length > 0 ? ` · ${fields.join('; ')}` : ''}`;
  };
  section(
    'Documentation (Hudu)',
    rest((s) => s.tool === 'hudu'),
    LIMITS.documentation,
    recordLine,
  );
  section(
    'Recent files (SharePoint)',
    rest((s) => s.tool === 'sharepoint'),
    LIMITS.files,
    recordLine,
  );
  section(
    `Other records from the last ${RECENT_DAYS} days`,
    rest(
      (s) =>
        s.tool !== 'hudu' &&
        s.tool !== 'sharepoint' &&
        s.recordType !== 'Device' &&
        s.recordType !== 'Ticket' &&
        ageDays(s.recordedAt) <= RECENT_DAYS,
    ),
    LIMITS.other,
    recordLine,
  );

  // Freshness ----------------------------------------------------------------
  // Only what's worth knowing; a healthy tool's last sync time would change
  // the pack, and so its hash, every few minutes.
  const stale = input.connectors.filter(
    (c) => c.status === 'failing' || !c.lastSyncAt || ageDays(c.lastSyncAt) > 1,
  );
  section('Tools not up to date', stale, stale.length, (c) =>
    c.status === 'failing'
      ? `${TOOL_NAMES[c.tool]} is failing to sync${c.failure ? ` since ${day(c.failure.since)}` : ''}, so its records may be out of date`
      : `${TOOL_NAMES[c.tool]} last synced ${c.lastSyncAt ? day(c.lastSyncAt) : 'never'}`,
  );

  // So "no tickets here" isn't read as "no tickets".
  const kept = INTELLIGENCE_RECORDS.filter((record) => !shared[record.id]);
  section(
    'Not shared with you',
    kept,
    kept.length,
    (record) =>
      `${record.name} from ${record.from}: the MSP keeps these from you, so don’t assume there are none`,
  );

  const text = `<client_records>\n${lines.join('\n')}\n</client_records>`;
  return {
    clientId: client.id,
    text,
    hash: createHash('sha256').update(text).digest('hex'),
    sourceIds: (labels) => [
      ...new Set(
        labels.flatMap((label) => {
          const id = handles.get(label.replace(/[[\]\s]/g, '').toUpperCase());
          return id ? [id] : [];
        }),
      ),
    ],
  };
}

/** Builds client packs from the database. */
@Injectable()
export class ContextPacks {
  constructor(@Inject(DATABASE) private readonly db: DatabaseAdapter) {}

  /** Null when there's no such client. */
  async forClient(
    workspaceId: string,
    clientId: string,
  ): Promise<ClientPack | null> {
    const client = await this.db.clients.get(workspaceId, clientId);
    if (!client) return null;
    const preferences = intelligencePreferencesSchema.safeParse(
      await this.db.intelligence.preferences(workspaceId),
    );
    const filter = { clientId };
    const [
      links,
      attention,
      commitments,
      meetings,
      devices,
      tickets,
      sources,
      connectors,
    ] = await Promise.all([
      this.db.clients.links(workspaceId),
      this.db.attention.list(workspaceId, filter),
      this.db.commitments.list(workspaceId, filter),
      this.db.meetings.list(workspaceId, filter),
      this.db.devices.list(workspaceId, filter),
      this.db.tickets.list(workspaceId, filter),
      this.db.sources.listForClient(workspaceId, clientId),
      this.db.connectors.list(workspaceId),
    ]);
    return buildClientPack(
      {
        client,
        links: links.filter((link) => link.clientId === clientId),
        attention,
        commitments,
        meetings,
        devices,
        tickets,
        sources,
        connectors,
      },
      new Date(),
      preferences.data?.records,
    );
  }
}
