import type {
  AttentionItem,
  Client,
  Commitment,
  Device,
  Meeting,
  Recommendation,
  RecordSource,
  Report,
  ReportAudience,
  ReportLine,
  ReportSectionKind,
  TicketInsight,
  Urgency,
} from '@dossierhq/contracts';
import type { ClientLink, TicketSummary } from '@dossierhq/database';

/** Monday to Sunday, as calendar dates in the workspace's time zone. */
export type Week = { start: string; end: string };

/** What Dossier holds about one client when it drafts their report. */
export type DraftInput = {
  id: string;
  client: Client;
  week: Week;
  /** Who it's written for; the client's leadership unless it says. */
  audience?: ReportAudience;
  /** When the report is drafted. */
  now: string;
  timeZone: string;
  devices: Device[];
  tickets: TicketSummary[];
  /** The client's, most urgent first. */
  attention: AttentionItem[];
  /** Problems that touch every client, such as a tool that stopped syncing. */
  workspaceAttention: AttentionItem[];
  /** Open first, soonest due first. */
  commitments: Commitment[];
  meetings: Meeting[];
  /**
   * The client's recommendations. Those accepted during the week go in its
   * report, as do drafts the team put in the report, every week they're in.
   */
  recommendations: Recommendation[];
  /** Where the client lives in each tool, for the counts to link to. */
  links: ClientLink[];
  /**
   * Dossier's reads of the client's tickets. A ticket whose read has an
   * executive version is written up from it: what happened and where it
   * stands, in words the client's leadership read.
   */
  insights?: TicketInsight[];
};

/** The sections a report is drafted with. */
type Drafted = Extract<
  ReportSectionKind,
  | 'brief'
  | 'from-you'
  | 'done'
  | 'watching'
  | 'coming-up'
  | 'questions'
  | 'devices'
  | 'alerts'
  | 'tickets'
>;

/**
 * Each reader's report, in order. Leadership's is the brief, and may be all
 * they read: the week in two or three sentences, what's needed from them,
 * what was done, what's being watched and what's next, in plain words. A
 * technician's is the detail: alerts, devices and tickets by name and
 * number, with the tools' own statuses.
 */
const LAYOUTS: Record<ReportAudience, { kind: Drafted; title: string }[]> = {
  executive: [
    { kind: 'brief', title: 'The week in brief' },
    { kind: 'from-you', title: 'What we need from you' },
    { kind: 'done', title: 'What we did' },
    { kind: 'watching', title: 'What we’re watching' },
    { kind: 'coming-up', title: 'Coming up' },
    { kind: 'questions', title: 'Your questions' },
  ],
  technician: [
    { kind: 'brief', title: 'Summary' },
    { kind: 'from-you', title: 'Waiting on you' },
    { kind: 'alerts', title: 'Alerts' },
    { kind: 'devices', title: 'Devices and patching' },
    { kind: 'tickets', title: 'Open tickets' },
    { kind: 'done', title: 'Done this week' },
    { kind: 'watching', title: 'Watch list' },
    { kind: 'coming-up', title: 'Follow-ups' },
    { kind: 'questions', title: 'Your questions' },
  ],
};

/** How many records a section lists before it sums up the rest in one line. */
const LIST_LIMIT = 12;
/** How many things a section of the brief lists before it counts the rest. */
const BRIEF_LIMIT = 6;
/**
 * Helpdesk requests listed one by one before the rest are counted, for
 * leadership: the few that matter, not the whole queue, which the team has
 * in the tool. A technician's report lists up to LIST_LIMIT.
 */
const TICKET_LIMIT = 6;
/** Operating systems a technician's report names before it counts the rest. */
const SYSTEM_LIMIT = 5;

const URGENCY_ORDER: Record<Urgency, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};
/** How many records one line cites, at most. */
const CITE_LIMIT = 10;
/** A device quiet for this long may be switched off or out of the office. */
const QUIET_DAYS = 14;
const DAY_MS = 86_400_000;

const LOCALE = 'en-GB';
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE, { timeZone, ...options });
    formatters.set(key, format);
  }
  return format;
}

/** The calendar date of an instant in a time zone, e.g. `2026-10-28`. */
export function localDate(iso: string, timeZone: string): string {
  const parts = formatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/** The Monday-to-Sunday week `now` falls in, in the workspace's time zone. */
export function weekOf(now: string, timeZone: string): Week {
  const today = localDate(now, timeZone);
  const sinceMonday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -sinceMonday);
  return { start, end: addDays(start, 6) };
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Report lines are sentences; tools' titles often aren't. */
const sentence = (text: string) => {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** A title to carry on writing after: no closing full stop. */
const clause = (text: string) => text.trim().replace(/[.!?…]+$/, '');

/**
 * A ticket's subject as a person would say it, on one line: without the
 * "FW:" and "RE:" an email leaves on it, the short tags a team puts in
 * front ("BPI | "), or a status typed onto the end ("– In Progress").
 */
const plainSubject = (subject: string) => {
  let plain = subject.replace(/\s+/g, ' ').trim();
  for (;;) {
    const next = plain
      .replace(/^(re|fw|fwd)\s*:\s*/i, '')
      .replace(/^[A-Z0-9][A-Z0-9&.-]{1,9}\s*\|\s*/, '');
    if (next === plain) break;
    plain = next;
  }
  plain = clause(
    plain.replace(
      /\s+[-–—]\s*(in progress|open|new|pending|on hold|waiting|closed|resolved|done)$/i,
      '',
    ),
  );
  if (!plain) return subject.trim();
  // "monday invoices" reads as a sentence; "iPhone" stays as it's spelt.
  return /^[a-z]+\b/.test(plain) && !/^\S*[A-Z]/.test(plain)
    ? `${plain[0]!.toUpperCase()}${plain.slice(1)}`
    : plain;
};

/**
 * A person as a tool names them: "BPI\dskinner" is "dskinner",
 * "DebbieSkinner" is "Debbie Skinner".
 */
const personName = (name: string) => {
  const bare = name.replace(/^.*\\/, '').replace(/@.*$/, '').trim();
  return /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(bare)
    ? bare.replace(/([a-z])([A-Z])/g, '$1 $2')
    : bare || name;
};

/**
 * A request is waiting on the client, by its tool's own status: worth
 * saying, since only they can move it.
 */
const waitingOnClient = (status: string) =>
  /wait|pending|hold/i.test(status) &&
  /client|customer|requester|user|reply|response/i.test(status);

/** "Ann", "Ann and Tom", "Ann, Tom and Priya". */
const andList = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const DEVICE_TYPES: Record<Device['type'], [one: string, many: string]> = {
  workstation: ['workstation', 'workstations'],
  laptop: ['laptop', 'laptops'],
  server: ['server', 'servers'],
  network: ['network device', 'network devices'],
};

/**
 * "LT-03 (laptop, Windows 11 Pro, Ann Lee)": the name first, as a
 * technician finds it in the tool, then what it is and whose.
 */
const deviceSpec = (d: Device) =>
  `${d.name} (${[
    DEVICE_TYPES[d.type][0],
    d.os.trim(),
    d.assignedTo && personName(d.assignedTo),
  ]
    .filter(Boolean)
    .join(', ')})`;

type Cited = { text: string; sourceIds: string[] };

/**
 * Drafts a client's weekly report from what the tools last synced, by rules:
 * the records the client screen shows, written up as sentences. Every line
 * cites the records it rests on. Counts, such as how many devices are
 * patched, cite a snapshot of the count that links to the client in the
 * tool, so anyone can check it there. The caller adds the cited records.
 */
export function draftReport(input: DraftInput): Report {
  const { client, week, now, timeZone } = input;
  const audience = input.audience ?? 'executive';
  const inWeek = (iso: string) => {
    const date = localDate(iso, timeZone);
    return date >= week.start && date <= week.end;
  };
  const dayMonth = (iso: string) =>
    formatter(timeZone, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(iso));
  const calendarDay = (date: string) =>
    formatter('UTC', { day: 'numeric', month: 'long' }).format(
      new Date(`${date}T00:00:00Z`),
    );

  let lineCount = 0;
  const line = ({ text, sourceIds }: Cited): ReportLine => ({
    id: `line-${++lineCount}`,
    text,
    sourceIds: [...new Set(sourceIds)].slice(0, CITE_LIMIT),
  });
  /** A line per item, then one line for any past the limit. */
  const listed = <T>(
    items: T[],
    each: (item: T) => Cited,
    rest: (count: number) => string,
    limit = LIST_LIMIT,
  ): ReportLine[] => {
    const shown = items.slice(0, limit).map((item) => line(each(item)));
    const more = items.slice(limit);
    if (more.length === 0) return shown;
    return [
      ...shown,
      line({
        text: rest(more.length),
        sourceIds: more.flatMap((item) => each(item).sourceIds),
      }),
    ];
  };

  // What the week holds ------------------------------------------------------

  const { devices, tickets, attention } = input;
  const urgent = attention.filter((item) => item.urgency !== 'normal');
  const critical = attention.filter((item) => item.urgency === 'critical');
  const alerts = attention.filter((item) => item.kind === 'alert');
  const urgentAlerts = alerts.filter((item) => item.urgency !== 'normal');
  const criticalAlerts = alerts.filter((item) => item.urgency === 'critical');
  // Everything but routine alerts, which the Alerts section lists.
  const needsAttention = attention.filter(
    (item) => item.kind !== 'alert' || item.urgency !== 'normal',
  );
  const listedAbove = new Set(needsAttention.flatMap((item) => item.sourceIds));

  const patched = devices.filter((d) => d.patchStatus === 'current').length;
  const pending = devices.filter((d) => d.patchStatus === 'pending').length;
  const failed = devices.filter((d) => d.patchStatus === 'failed').length;
  const behind = devices
    .filter((d) => d.patchStatus !== 'current')
    .sort(
      (a, b) =>
        Number(b.patchStatus === 'failed') -
          Number(a.patchStatus === 'failed') || a.name.localeCompare(b.name),
    );
  const quiet = devices.filter(
    (d) => Date.parse(now) - Date.parse(d.lastSeenAt) > QUIET_DAYS * DAY_MS,
  );
  const types = (Object.keys(DEVICE_TYPES) as Device['type'][])
    .map((type) => ({
      type,
      count: devices.filter((d) => d.type === type).length,
    }))
    .filter(({ count }) => count > 0);
  // Operating systems, most devices first.
  const systems = [
    ...devices
      .reduce((count, d) => {
        const os = d.os.trim() || 'Unknown';
        return count.set(os, (count.get(os) ?? 0) + 1);
      }, new Map<string, number>())
      .entries(),
  ].sort(([a, m], [b, n]) => n - m || a.localeCompare(b));
  const deviceBySource = new Map(devices.map((d) => [d.sourceId, d]));

  const opened = tickets.filter((t) => inWeek(t.openedAt));
  const closed = tickets.filter((t) => !t.open && inWeek(t.updatedAt));
  const stillOpen = tickets.filter((t) => t.open);

  const meetings = input.meetings
    .filter((m) => inWeek(m.occurredAt))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const said = (key: 'planning' | 'concerns' | 'askedFor') =>
    meetings.flatMap((meeting) =>
      meeting[key].map((point) => ({ meeting, point })),
    );
  // Open actions, unless What we're watching already says they're overdue.
  const promises = input.commitments.filter(
    (c) =>
      c.status === 'open' && !c.sourceIds.every((id) => listedAbove.has(id)),
  );
  // Recommendations accepted this week, and drafts the team put in the
  // report until they take them out.
  const included = input.recommendations.filter((r) =>
    r.status === 'accepted'
      ? r.decidedAt !== null && inWeek(r.decidedAt)
      : r.status === 'draft' && r.inReport,
  );
  // A recommendation's executive version, unless it was written before the
  // team last reworded the recommendation.
  const forLeaders = (r: Recommendation) =>
    r.executive && !r.executiveStale ? r.executive : null;
  // Those that ask the client to decide something, and those that don't.
  const asks = included.filter((r) => forLeaders(r)?.decision);
  const plans = included.filter((r) => !forLeaders(r)?.decision);

  // Counts, kept as records so the lines that use them can cite them --------

  const snapshots: RecordSource[] = [];
  const counted = formatter(timeZone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(now));
  const ninjaOne = input.links.find(
    (link) => link.clientId === client.id && link.tool === 'ninjaone',
  );
  /** Cites a snapshot of a count, or without a link to check it, the records. */
  const count = (
    key: string,
    title: string,
    fields: { label: string; value: string }[],
    records: string[],
  ): string[] => {
    if (!ninjaOne) return records.slice(0, CITE_LIMIT);
    const source: RecordSource = {
      id: `${input.id}-${key}`,
      kind: 'record',
      clientId: client.id,
      tool: 'ninjaone',
      recordId: `${key.toUpperCase()}-${week.start}`,
      recordType: 'Count',
      title,
      recordedAt: now,
      url: ninjaOne.url,
      fields: [
        { label: 'Week', value: `${week.start} to ${week.end}` },
        ...fields,
        { label: 'Counted', value: counted },
      ],
    };
    snapshots.push(source);
    return [source.id];
  };

  const deviceCites =
    devices.length === 0
      ? []
      : count(
          'devices',
          `Patch status of ${plural(devices.length, 'device')}`,
          [
            { label: 'Devices', value: String(devices.length) },
            ...types.map(({ type, count: n }) => ({
              label: DEVICE_TYPES[type][1].replace(/^./, (c) =>
                c.toUpperCase(),
              ),
              value: String(n),
            })),
            { label: 'Fully patched', value: String(patched) },
            { label: 'Waiting to finish', value: String(pending) },
            { label: 'Failed', value: String(failed) },
            ...systems
              .slice(0, SYSTEM_LIMIT)
              .map(([os, n]) => ({ label: os, value: String(n) })),
          ],
          [...behind, ...devices].map((d) => d.sourceId),
        );
  const ticketCites =
    tickets.length === 0
      ? []
      : count(
          'tickets',
          `Helpdesk tickets, week of ${calendarDay(week.start)}`,
          [
            { label: 'Opened', value: String(opened.length) },
            { label: 'Closed', value: String(closed.length) },
            { label: 'Still open', value: String(stillOpen.length) },
          ],
          [...opened, ...closed, ...stillOpen].map((t) => t.sourceId),
        );

  // How each kind of record reads -------------------------------------------

  const level = (item: AttentionItem) =>
    item.urgency === 'critical'
      ? 'Critical: '
      : item.urgency === 'high'
        ? 'Urgent: '
        : '';

  /** "Critical: Disk almost full (HD-FS01, since Monday 5 October)." */
  const alertLine = (item: AttentionItem): Cited => {
    const device = item.sourceIds
      .map((id) => deviceBySource.get(id))
      .find((d) => d !== undefined);
    const where = [
      device && !item.title.includes(device.name) && device.name,
      `since ${dayMonth(item.raisedAt)}`,
    ].filter(Boolean);
    return {
      text: `${level(item)}${clause(item.title)} (${where.join(', ')}).`,
      sourceIds: item.sourceIds,
    };
  };

  // Helpdesk requests read as the client's leadership would put them: what
  // happened and where it stands, never the emails themselves, the tool's
  // statuses or its ticket numbers. A request Dossier has read since it last
  // changed is written from that read's executive version, which rests only
  // on what the client saw; any other is named by its subject.
  const readOf = new Map(
    (input.insights ?? []).map((insight) => [insight.ticketId, insight]),
  );
  const headline = (t: TicketSummary) => {
    const read = readOf.get(t.id);
    return read?.executive && read.readAt >= t.updatedAt
      ? clause(read.executive.headline)
      : null;
  };
  const forWhom = (t: TicketSummary) =>
    t.requester ? ` for ${personName(t.requester)}` : '';

  /**
   * Requests about the same thing for the same person, as one: a forwarded
   * email often lands as two tickets, and the reader needs it once.
   */
  const grouped = (list: TicketSummary[]): TicketSummary[][] => {
    const groups = new Map<string, TicketSummary[]>();
    for (const t of list) {
      const key = `${plainSubject(t.subject).toLowerCase()}\n${t.requester ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.values()];
  };
  /** "3 more open requests", counting requests, not the lines for them. */
  const remaining = (groups: TicketSummary[][], lines: number, what: string) =>
    `${plural(groups.slice(groups.length - lines).flat().length, what)}.`;

  const openTicketLine = (group: TicketSummary[]): Cited => {
    const [t] = group as [TicketSummary, ...TicketSummary[]];
    const first = group.reduce((a, b) => (b.openedAt < a.openedAt ? b : a));
    const where = [
      group.length > 1 && `${group.length} requests`,
      group.some((each) => each.urgency === 'critical')
        ? 'critical'
        : group.some((each) => each.urgency === 'high') && 'urgent',
      group.some((each) => waitingOnClient(each.status)) &&
        'waiting on your reply',
      `open since ${dayMonth(first.openedAt)}`,
    ].filter(Boolean);
    const said = headline(t);
    return {
      text: said
        ? `${said} (${where.join(', ')}).`
        : `“${plainSubject(t.subject)}”${forWhom(t)} (${where.join(', ')}).`,
      sourceIds: group.map((each) => each.sourceId),
    };
  };

  /** How long a closed request took: "the same day", "in 3 days". */
  const took = (t: TicketSummary) => {
    if (localDate(t.openedAt, timeZone) === localDate(t.updatedAt, timeZone)) {
      return 'the same day';
    }
    const days = Math.max(
      1,
      Math.round((Date.parse(t.updatedAt) - Date.parse(t.openedAt)) / DAY_MS),
    );
    return `in ${plural(days, 'day')}`;
  };

  const resolvedLine = (group: TicketSummary[]): Cited => {
    const [t] = group as [TicketSummary, ...TicketSummary[]];
    const sourceIds = group.map((each) => each.sourceId);
    const said = headline(t);
    if (said) return { text: sentence(said), sourceIds };
    if (group.length > 1) {
      return {
        text: `Resolved ${group.length} requests about “${plainSubject(t.subject)}”${forWhom(t)}.`,
        sourceIds,
      };
    }
    return {
      text: `Resolved “${plainSubject(t.subject)}”${forWhom(t)} ${took(t)}.`,
      sourceIds,
    };
  };

  // A technician's report names each ticket by its number and status, as
  // the tool shows it, one line each: they look it up there.

  /** "#4821 “Printer offline” for Ann Lee". */
  const ticketName = (t: TicketSummary) =>
    `#${t.number} “${plainSubject(t.subject)}”${forWhom(t)}`;
  const status = (t: TicketSummary, otherwise: string) =>
    clause(t.status) || otherwise;
  const mostUrgent = (a: TicketSummary, b: TicketSummary) =>
    URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
    a.openedAt.localeCompare(b.openedAt);

  /** "#4821 “Printer offline” for Ann Lee: In Progress, high priority, …". */
  const ticketLine = (t: TicketSummary): Cited => ({
    text: `${ticketName(t)}: ${[
      status(t, 'Open'),
      t.urgency === 'critical'
        ? 'critical'
        : t.urgency === 'high' && 'high priority',
      `open since ${dayMonth(t.openedAt)}`,
      t.assignedTo && `with ${personName(t.assignedTo)}`,
    ]
      .filter(Boolean)
      .join(', ')}.`,
    sourceIds: [t.sourceId],
  });

  const openGroups = grouped(stillOpen);
  const closedGroups = grouped(closed);
  // Open requests only the client can move, those that are urgent, and the
  // rest, which the brief counts and the details list.
  const waiting = openGroups.filter((group) =>
    group.some((t) => waitingOnClient(t.status)),
  );
  const pressing = openGroups.filter(
    (group) =>
      !waiting.includes(group) && group.some((t) => t.urgency !== 'normal'),
  );
  const routine = openGroups.filter(
    (group) => !waiting.includes(group) && !pressing.includes(group),
  );

  const waitingLine = (group: TicketSummary[]): Cited => {
    const [t] = group as [TicketSummary, ...TicketSummary[]];
    const said = headline(t);
    return {
      text: said
        ? `${said}; we’re waiting on your reply.`
        : `“${plainSubject(t.subject)}”${forWhom(t)} is waiting on your reply.`,
      sourceIds: group.map((each) => each.sourceId),
    };
  };

  /** "Two laptops are out of warranty. Approve replacing them by Friday." */
  const askLine = (r: Recommendation): Cited => {
    const brief = forLeaders(r)!;
    return {
      text: `${sentence(brief.headline)} ${sentence(brief.decision!)}`,
      sourceIds: r.sourceIds,
    };
  };

  /** A recommendation as the team wrote it, and why, for a technician. */
  const technicalLine = (r: Recommendation, ask?: string | null): Cited => ({
    text: [r.title, r.reason, ask]
      .filter((part): part is string => Boolean(part?.trim()))
      .map(sentence)
      .join(' '),
    sourceIds: r.sourceIds,
  });

  const meetingLine = (m: Meeting): Cited => {
    const guests = m.attendees
      .filter((a) => a.role === 'client')
      .map((a) => a.name);
    const details = [
      plural(m.durationMinutes, 'minute'),
      guests.length > 0 && `with ${andList(guests)}`,
    ].filter(Boolean);
    return {
      text: `Met for “${m.title}” on ${dayMonth(m.occurredAt)} (${details.join(', ')}).`,
      sourceIds: [m.recordingSourceId],
    };
  };

  const promiseLine = (c: Commitment): Cited => {
    const when = [
      `agreed ${calendarDay(localDate(c.madeAt, timeZone))}`,
      c.dueOn && `due ${calendarDay(c.dueOn)}`,
    ].filter(Boolean);
    return {
      text: `${clause(c.statement)} (${when.join(', ')}).`,
      sourceIds: c.sourceIds,
    };
  };

  /** A point made in a meeting, as each section puts it. */
  type Said = ReturnType<typeof said>[number];
  const concernLine = ({ meeting, point }: Said): Cited => ({
    text: `Raised in “${meeting.title}”: ${sentence(point.text)}`,
    sourceIds: point.sourceIds,
  });
  const askedLine = ({ meeting, point }: Said): Cited => ({
    text: `You asked in “${meeting.title}”: ${sentence(point.text)}`,
    sourceIds: point.sourceIds,
  });
  const plannedLine = ({ meeting, point }: Said): Cited => ({
    text: `Planned in “${meeting.title}”: ${sentence(point.text)}`,
    sourceIds: point.sourceIds,
  });

  /** "All 3 devices are fully patched.", "1 of 4 devices is fully patched." */
  const patchedText = () =>
    patched === devices.length
      ? devices.length === 1
        ? 'The one device is fully patched.'
        : `All ${devices.length} devices are fully patched.`
      : `${patched} of ${plural(devices.length, 'device')} ${patched === 1 ? 'is' : 'are'} fully patched.`;

  // Sections -----------------------------------------------------------------

  const failedToPatch = behind.filter((d) => d.patchStatus === 'failed');
  const waitingTickets = stillOpen
    .filter((t) => waitingOnClient(t.status))
    .sort(mostUrgent);

  /**
   * Leadership's: what matters to the business, in plain words. Each
   * request is said once, a few are named and the rest counted; devices and
   * routine alerts are counted, not listed.
   */
  const forLeadership = (): Partial<Record<Drafted, ReportLine[]>> => ({
    // Only what the client can move: decisions, and replies they owe.
    'from-you': [
      ...listed(
        asks,
        askLine,
        (n) => `${plural(n, 'more decision')} to make.`,
        BRIEF_LIMIT,
      ),
      ...listed(
        waiting,
        waitingLine,
        (n) => {
          const count = waiting.slice(waiting.length - n).flat().length;
          return `${plural(count, 'more request')} ${count === 1 ? 'is' : 'are'} waiting on your reply.`;
        },
        BRIEF_LIMIT,
      ),
    ],

    done: [
      ...listed(
        closedGroups,
        resolvedLine,
        (n) => `Resolved ${remaining(closedGroups, n, 'more request')}`,
        TICKET_LIMIT,
      ),
      ...listed(
        meetings,
        meetingLine,
        (n) => `${plural(n, 'more meeting')} this week.`,
        BRIEF_LIMIT,
      ),
    ],

    // What could go wrong if it's left: urgent things first, then a line
    // each for what a technician's report would list in full.
    watching: [
      ...listed(
        needsAttention,
        (item) => ({ text: sentence(item.title), sourceIds: item.sourceIds }),
        (n) =>
          `${plural(n, 'more item')} also need${n === 1 ? 's' : ''} attention.`,
        BRIEF_LIMIT,
      ),
      ...listed(
        pressing,
        openTicketLine,
        (n) => remaining(pressing, n, 'more urgent request'),
        TICKET_LIMIT,
      ),
      ...(routine.length > 0
        ? [
            line({
              text: (() => {
                const n = routine.flat().length;
                const other =
                  waiting.length + pressing.length > 0 ? 'other ' : '';
                return `${plural(n, `${other}request`)} ${n === 1 ? 'is' : 'are'} still open.`;
              })(),
              sourceIds: routine.flatMap((group) =>
                group.map((t) => t.sourceId),
              ),
            }),
          ]
        : []),
      ...(behind.length > 0
        ? [
            line({
              text:
                failedToPatch.length === behind.length
                  ? `${plural(behind.length, 'device')} failed to install updates.`
                  : failedToPatch.length === 0
                    ? `${plural(behind.length, 'device')} ${behind.length === 1 ? 'is' : 'are'} waiting to finish installing updates.`
                    : `${behind.length} devices still need updates: ${failedToPatch.length} failed to install them and ${behind.length - failedToPatch.length} ${behind.length - failedToPatch.length === 1 ? 'is' : 'are'} waiting to finish.`,
              sourceIds: behind.map((d) => d.sourceId),
            }),
          ]
        : []),
      ...(quiet.length > 0
        ? [
            line({
              text: `${plural(quiet.length, 'device')} ${quiet.length === 1 ? 'hasn’t' : 'haven’t'} checked in for over two weeks.`,
              sourceIds: quiet.map((d) => d.sourceId),
            }),
          ]
        : []),
      ...listed(
        said('concerns'),
        concernLine,
        (n) => `${plural(n, 'more concern')} from meetings.`,
        BRIEF_LIMIT,
      ),
    ],

    'coming-up': [
      ...listed(
        promises,
        promiseLine,
        (n) => `${plural(n, 'more action')} from meetings.`,
        BRIEF_LIMIT,
      ),
      ...listed(
        plans,
        (r) => ({
          text: sentence(forLeaders(r)?.headline ?? r.title),
          sourceIds: r.sourceIds,
        }),
        (n) => `${plural(n, 'more recommendation')}.`,
        BRIEF_LIMIT,
      ),
      ...listed(
        said('askedFor'),
        askedLine,
        (n) => `${plural(n, 'more request')} from meetings.`,
        BRIEF_LIMIT,
      ),
      ...listed(
        said('planning'),
        plannedLine,
        (n) => `${plural(n, 'more plan')} from meetings.`,
        BRIEF_LIMIT,
      ),
    ],
  });

  /**
   * A technician's: every alert, every device behind or gone quiet and
   * every ticket, named as the tools name them, most urgent first.
   */
  const forTechnicians = (): Partial<Record<Drafted, ReportLine[]>> => ({
    'from-you': [
      ...listed(
        asks,
        (r) => technicalLine(r, forLeaders(r)!.decision),
        (n) => `${plural(n, 'more decision')} to make.`,
      ),
      ...listed(
        waitingTickets,
        (t) => ({
          text: `${ticketName(t)}: ${status(t, 'Waiting on you')}, last updated ${dayMonth(t.updatedAt)}.`,
          sourceIds: [t.sourceId],
        }),
        (n) => `${plural(n, 'more ticket')} waiting on you.`,
      ),
    ],

    // Every active alert, urgent ones too, with where and since when.
    alerts: listed(alerts, alertLine, (n) => `${plural(n, 'more alert')}.`),

    devices: [
      ...(types.length > 1
        ? [
            line({
              text: `${plural(devices.length, 'device')}: ${andList(
                types.map(({ type, count: n }) =>
                  plural(n, ...DEVICE_TYPES[type]),
                ),
              )}.`,
              sourceIds: deviceCites,
            }),
          ]
        : []),
      ...(devices.length > 0
        ? [
            line({
              text:
                behind.length === 0
                  ? patchedText()
                  : `${patched} of ${plural(devices.length, 'device')} fully patched${failed > 0 ? `, ${failed} failed` : ''}${pending > 0 ? `, ${pending} waiting to finish` : ''}.`,
              sourceIds: deviceCites,
            }),
            line({
              text: `Operating systems: ${andList([
                ...systems
                  .slice(0, SYSTEM_LIMIT)
                  .map(([os, n]) => `${os} (${n})`),
                ...(systems.length > SYSTEM_LIMIT
                  ? [plural(systems.length - SYSTEM_LIMIT, 'other')]
                  : []),
              ])}.`,
              sourceIds: deviceCites,
            }),
          ]
        : []),
      ...listed(
        behind,
        (d) => ({
          text: `${deviceSpec(d)}: ${
            d.patchStatus === 'failed'
              ? 'updates failed to install'
              : 'updates waiting to finish installing'
          }.`,
          sourceIds: [d.sourceId],
        }),
        (n) =>
          `${plural(n, 'more device')} still need${n === 1 ? 's' : ''} updates.`,
      ),
      ...listed(
        quiet,
        (d) => ({
          text: `${deviceSpec(d)}: last checked in ${dayMonth(d.lastSeenAt)}, ${plural(
            Math.floor((Date.parse(now) - Date.parse(d.lastSeenAt)) / DAY_MS),
            'day',
          )} ago.`,
          sourceIds: [d.sourceId],
        }),
        (n) =>
          `${plural(n, 'more device')} ${n === 1 ? 'hasn’t' : 'haven’t'} checked in for over two weeks.`,
      ),
    ],

    // Open tickets but those waiting on the client, listed above them.
    tickets: [
      ...(tickets.length > 0
        ? [
            line({
              text: `${
                opened.length + closed.length === 0
                  ? 'No tickets opened or closed this week'
                  : `${plural(opened.length, 'ticket')} opened and ${closed.length} closed this week`
              }; ${stillOpen.length} open${
                waitingTickets.length > 0
                  ? `, ${waitingTickets.length} of them waiting on you`
                  : ''
              }.`,
              sourceIds: ticketCites,
            }),
          ]
        : []),
      ...listed(
        stillOpen.filter((t) => !waitingTickets.includes(t)).sort(mostUrgent),
        ticketLine,
        (n) => `${plural(n, 'more open ticket')}.`,
      ),
    ],

    done: [
      ...listed(
        [...closed].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
        (t) => ({
          text: `${ticketName(t)}: ${status(t, 'Closed')} ${took(t)}.`,
          sourceIds: [t.sourceId],
        }),
        (n) => `${plural(n, 'more ticket')} closed.`,
      ),
      ...listed(
        meetings,
        meetingLine,
        (n) => `${plural(n, 'more meeting')} this week.`,
      ),
    ],

    // What isn't an alert: risks, overdue actions and worries from meetings.
    watching: [
      ...listed(
        attention.filter((item) => item.kind !== 'alert'),
        (item) => ({
          text: `${level(item)}${sentence(item.title)}`,
          sourceIds: item.sourceIds,
        }),
        (n) => `${plural(n, 'more item')} to watch.`,
      ),
      ...listed(
        said('concerns'),
        concernLine,
        (n) => `${plural(n, 'more concern')} from meetings.`,
      ),
    ],

    'coming-up': [
      ...listed(
        promises,
        promiseLine,
        (n) => `${plural(n, 'more action')} from meetings.`,
      ),
      ...listed(
        plans,
        (r) => technicalLine(r),
        (n) => `${plural(n, 'more recommendation')}.`,
      ),
      ...listed(
        said('askedFor'),
        askedLine,
        (n) => `${plural(n, 'more request')} from meetings.`,
      ),
      ...listed(
        said('planning'),
        plannedLine,
        (n) => `${plural(n, 'more plan')} from meetings.`,
      ),
    ],
  });

  const lines = audience === 'executive' ? forLeadership() : forTechnicians();

  // The opening paragraph, put together from the counts. Dossier's model
  // writes it instead where the workspace has one; this is what's left when
  // it can't. Leadership's says how things stand and whether anything is
  // needed from them; a technician's gives the figures.
  const standing: Cited[] = [];
  if (audience === 'executive') {
    if (tickets.length > 0) {
      standing.push({
        text:
          closed.length + stillOpen.length === 0
            ? 'no helpdesk requests are open'
            : closed.length === 0
              ? `${plural(stillOpen.length, 'request')} ${stillOpen.length === 1 ? 'is' : 'are'} still open`
              : `we resolved ${plural(closed.length, 'request')} and ${stillOpen.length === 0 ? 'none are' : `${stillOpen.length} ${stillOpen.length === 1 ? 'is' : 'are'}`} still open`,
        sourceIds: ticketCites,
      });
    }
    if (devices.length > 0) {
      standing.push({
        text: clause(patchedText()).replace(/^./, (c) => c.toLowerCase()),
        sourceIds: deviceCites,
      });
    }
    if (devices.length > 0 || alerts.length > 0) {
      standing.push(
        alerts.length === 0
          ? { text: 'there are no active alerts', sourceIds: deviceCites }
          : {
              text: `${plural(alerts.length, 'alert')} ${alerts.length === 1 ? 'is' : 'are'} active${
                criticalAlerts.length === alerts.length
                  ? alerts.length === 1
                    ? ', and it’s critical'
                    : ', all critical'
                  : criticalAlerts.length > 0
                    ? `, ${criticalAlerts.length} of them critical`
                    : ''
              }`,
              sourceIds: alerts.map((item) => item.sourceIds[0]!),
            },
      );
    }
  } else {
    if (tickets.length > 0) {
      const urgentOpen = stillOpen.filter((t) => t.urgency !== 'normal');
      standing.push({
        text: `${plural(stillOpen.length, 'ticket')} open${urgentOpen.length > 0 ? ` (${urgentOpen.length} urgent)` : ''}, ${
          opened.length + closed.length === 0
            ? 'none opened or closed this week'
            : `${opened.length} opened and ${closed.length} closed this week`
        }`,
        sourceIds: ticketCites,
      });
    }
    if (devices.length > 0) {
      standing.push({
        text: `${patched} of ${plural(devices.length, 'device')} fully patched${failed > 0 ? ` (${failed} failed)` : ''}`,
        sourceIds: deviceCites,
      });
    }
    if (devices.length > 0 || alerts.length > 0) {
      standing.push(
        alerts.length === 0
          ? { text: 'no active alerts', sourceIds: deviceCites }
          : {
              text: `${plural(alerts.length, 'active alert')}${criticalAlerts.length > 0 ? ` (${criticalAlerts.length} critical)` : ''}`,
              sourceIds: alerts.map((item) => item.sourceIds[0]!),
            },
      );
    }
    if (quiet.length > 0) {
      standing.push({
        text: `${plural(quiet.length, 'device')} not seen for over two weeks`,
        sourceIds: quiet.map((d) => d.sourceId),
      });
    }
  }
  // Urgent requests count too: a critical one open isn't a quiet week.
  const pressed = urgent.length + pressing.length;
  const owed =
    asks.length +
    (audience === 'executive' ? waiting.length : waitingTickets.length);
  const opening: Cited | null =
    standing.length === 0
      ? meetings.length > 0
        ? {
            text: `We met ${meetings.length === 1 ? 'once' : `${meetings.length} times`} this week.`,
            sourceIds: meetings.map((m) => m.recordingSourceId),
          }
        : null
      : {
          text:
            audience === 'executive'
              ? [
                  `${pressed === 0 ? 'Nothing urgent this week' : `${plural(pressed, 'thing needs', 'things need')} attention`}: ${standing.map((c) => c.text).join('; ')}.`,
                  owed > 0 &&
                    `We need ${owed === 1 ? 'one thing' : `${owed} things`} from you, listed below.`,
                ]
                  .filter(Boolean)
                  .join(' ')
              : [
                  `${standing
                    .map((c) => c.text)
                    .join('; ')
                    .replace(/^./, (c) => c.toUpperCase())}.`,
                  owed > 0 &&
                    `${owed === 1 ? 'One thing is' : `${owed} things are`} waiting on you.`,
                ]
                  .filter(Boolean)
                  .join(' '),
          sourceIds: standing.flatMap((c) => c.sourceIds),
        };
  lines.brief = opening ? [line(opening)] : [];
  // Answered by the caller, from the saved questions.
  lines.questions = [];

  // Why someone should read it before it goes out ---------------------------

  const exceptions = [
    // A tool that stopped syncing, not a standing notice like unshared tickets.
    ...input.workspaceAttention
      .filter((item) => item.kind === 'connection' && item.urgency !== 'normal')
      .map((item) => item.title),
    ...critical.slice(0, 3).map((item) => item.title),
    critical.length > 3 &&
      `${plural(critical.length - 3, 'more critical item')}`,
    critical.length === 0 &&
      urgent.length > 0 &&
      (audience === 'executive'
        ? `${plural(urgent.length, 'urgent item')} under What we’re watching`
        : `${plural(urgent.length, 'urgent item')} to check`),
    devices.length +
      tickets.length +
      attention.length +
      input.meetings.length +
      input.commitments.length ===
      0 && `Dossier has no records for ${client.name} yet`,
  ].filter((exception): exception is string => Boolean(exception));

  const patchedFigure = (label: string, note: string) =>
    devices.length > 0
      ? {
          label,
          // Rounded down, so 100% means every device.
          value: `${Math.floor((patched / devices.length) * 100)}%`,
          note,
        }
      : { label, value: '–', note: 'no devices' };
  const alertsFigure = {
    label: 'Alerts',
    value: String(alerts.length),
    note:
      criticalAlerts.length > 0
        ? `${criticalAlerts.length} critical`
        : urgentAlerts.length > 0
          ? `${urgentAlerts.length} urgent`
          : 'none urgent',
  };

  return {
    id: input.id,
    clientId: client.id,
    weekStart: week.start,
    weekEnd: week.end,
    status: 'draft',
    audience,
    generatedAt: now,
    exceptions: [...new Set(exceptions)],
    approvedAt: null,
    editedAt: null,
    sentAt: null,
    title: `${client.name} weekly report`,
    glance:
      audience === 'executive'
        ? [
            { label: 'Devices', value: String(devices.length) },
            patchedFigure('Up to date', `${patched} of ${devices.length}`),
            alertsFigure,
            {
              label: 'Requests',
              value: String(opened.length),
              note: `new, ${closed.length || 'none'} resolved`,
            },
          ]
        : [
            { label: 'Devices', value: String(devices.length) },
            patchedFigure(
              'Patched',
              failed > 0
                ? `${failed} failed`
                : `${patched} of ${devices.length}`,
            ),
            alertsFigure,
            {
              label: 'Open tickets',
              value: String(stillOpen.length),
              note: `${opened.length} new, ${closed.length} closed`,
            },
          ],
    sections: LAYOUTS[audience].map(({ kind, title }) => ({
      kind,
      title,
      lines: lines[kind] ?? [],
    })),
    sources: snapshots,
  };
}
