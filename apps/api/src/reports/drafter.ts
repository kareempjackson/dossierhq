import type {
  AttentionItem,
  Client,
  Commitment,
  Device,
  Meeting,
  Recommendation,
  RecordSource,
  Report,
  ReportLine,
  ReportSectionKind,
  Ticket,
  TicketInsight,
} from '@dossierhq/contracts';
import type { ClientLink } from '@dossierhq/database';

/** Monday to Sunday, as calendar dates in the workspace's time zone. */
export type Week = { start: string; end: string };

/** What Dossier holds about one client when it drafts their report. */
export type DraftInput = {
  id: string;
  client: Client;
  week: Week;
  /** When the report is drafted. */
  now: string;
  timeZone: string;
  devices: Device[];
  tickets: Ticket[];
  /** The client's, most urgent first. */
  attention: AttentionItem[];
  /** Problems that touch every client, such as a tool that stopped syncing. */
  workspaceAttention: AttentionItem[];
  /** Open first, soonest due first. */
  commitments: Commitment[];
  meetings: Meeting[];
  /** Those the MSP accepted. */
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

const SECTION_TITLES: Record<ReportSectionKind, string> = {
  'needs-attention': 'Needs attention',
  recommended: 'Recommended',
  summary: 'Summary',
  questions: 'Your questions',
  devices: 'Devices and patching',
  alerts: 'Alerts',
  tickets: 'Helpdesk',
  changes: 'Changes',
  'next-week': 'Next week',
};

/** How many records a section lists before it sums up the rest in one line. */
const LIST_LIMIT = 12;
/**
 * Helpdesk requests listed one by one before the rest are counted. The
 * report is read by the client's leadership: the few that matter, not the
 * whole queue, which the team has in the tool.
 */
const TICKET_LIMIT = 6;
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
 * "Ann Lee’s laptop (LT-03)": whose it is first, since that's how the
 * client's leadership know their machines; the name, to find it by.
 */
const deviceName = (d: Device) =>
  d.assignedTo
    ? `${personName(d.assignedTo)}’s ${DEVICE_TYPES[d.type][0]} (${d.name})`
    : d.name;

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
  // Open actions, unless Needs attention already says they're overdue.
  const promises = input.commitments.filter(
    (c) =>
      c.status === 'open' && !c.sourceIds.every((id) => listedAbove.has(id)),
  );
  const accepted = input.recommendations.filter(
    (r) =>
      r.status === 'accepted' && r.decidedAt !== null && inWeek(r.decidedAt),
  );

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

  /** "Critical: Disk almost full (HD-FS01, since Monday 5 October)." */
  const alertLine = (item: AttentionItem): Cited => {
    const device = item.sourceIds
      .map((id) => deviceBySource.get(id))
      .find((d) => d !== undefined);
    const where = [
      device && !item.title.includes(device.name) && device.name,
      `since ${dayMonth(item.raisedAt)}`,
    ].filter(Boolean);
    const level =
      item.urgency === 'critical'
        ? 'Critical: '
        : item.urgency === 'high'
          ? 'Urgent: '
          : '';
    return {
      text: `${level}${clause(item.title)} (${where.join(', ')}).`,
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
  const headline = (t: Ticket) => {
    const read = readOf.get(t.id);
    return read?.executive && read.readAt >= t.updatedAt
      ? clause(read.executive.headline)
      : null;
  };
  const forWhom = (t: Ticket) =>
    t.requester ? ` for ${personName(t.requester)}` : '';

  /**
   * Requests about the same thing for the same person, as one: a forwarded
   * email often lands as two tickets, and the reader needs it once.
   */
  const grouped = (list: Ticket[]): Ticket[][] => {
    const groups = new Map<string, Ticket[]>();
    for (const t of list) {
      const key = `${plainSubject(t.subject).toLowerCase()}\n${t.requester ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.values()];
  };
  /** "3 more open requests", counting requests, not the lines for them. */
  const remaining = (groups: Ticket[][], lines: number, what: string) =>
    `${plural(groups.slice(groups.length - lines).flat().length, what)}.`;

  const openTicketLine = (group: Ticket[]): Cited => {
    const [t] = group as [Ticket, ...Ticket[]];
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

  const resolvedLine = (group: Ticket[]): Cited => {
    const [t] = group as [Ticket, ...Ticket[]];
    const sourceIds = group.map((each) => each.sourceId);
    const said = headline(t);
    if (said) return { text: sentence(said), sourceIds };
    if (group.length > 1) {
      return {
        text: `Resolved ${group.length} requests about “${plainSubject(t.subject)}”${forWhom(t)}.`,
        sourceIds,
      };
    }
    const days = Math.max(
      1,
      Math.round((Date.parse(t.updatedAt) - Date.parse(t.openedAt)) / DAY_MS),
    );
    const took =
      localDate(t.openedAt, timeZone) === localDate(t.updatedAt, timeZone)
        ? 'the same day'
        : `in ${plural(days, 'day')}`;
    return {
      text: `Resolved “${plainSubject(t.subject)}”${forWhom(t)} ${took}.`,
      sourceIds,
    };
  };

  const openGroups = grouped(stillOpen);
  const closedGroups = grouped(closed);

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

  // Sections -----------------------------------------------------------------

  const lines: Record<ReportSectionKind, ReportLine[]> = {
    'needs-attention': listed(
      needsAttention,
      (item) => ({ text: sentence(item.title), sourceIds: item.sourceIds }),
      (n) =>
        `${plural(n, 'more item')} also need${n === 1 ? 's' : ''} attention.`,
    ),

    recommended: listed(
      accepted,
      (r) => ({ text: sentence(r.title), sourceIds: r.sourceIds }),
      (n) => `${plural(n, 'more recommendation')}.`,
    ),

    summary: [],

    // Answered by the caller, from the saved questions.
    questions: [],

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
                patched === devices.length
                  ? devices.length === 1
                    ? 'The one device is fully patched.'
                    : `All ${devices.length} devices are fully patched.`
                  : `${patched} of ${plural(devices.length, 'device')} ${patched === 1 ? 'is' : 'are'} fully patched.`,
              sourceIds: deviceCites,
            }),
          ]
        : []),
      ...listed(
        behind,
        (d) => ({
          text: `${deviceName(d)} ${
            d.patchStatus === 'failed'
              ? 'failed to install updates'
              : 'is waiting to finish installing updates'
          }.`,
          sourceIds: [d.sourceId],
        }),
        (n) =>
          `${plural(n, 'more device')} still need${n === 1 ? 's' : ''} updates.`,
      ),
      ...listed(
        quiet,
        (d) => ({
          text: `${deviceName(d)} hasn’t checked in since ${dayMonth(d.lastSeenAt)}; it may be switched off or out of the office.`,
          sourceIds: [d.sourceId],
        }),
        (n) =>
          `${plural(n, 'more device')} ${n === 1 ? 'hasn’t' : 'haven’t'} checked in for over two weeks.`,
      ),
    ],

    // Every active alert, urgent ones too, with where and since when.
    alerts: listed(alerts, alertLine, (n) => `${plural(n, 'more alert')}.`),

    tickets: [
      ...(tickets.length > 0
        ? [
            line({
              text: `${opened.length > 0 ? plural(opened.length, 'new request') : 'No new requests'} this week; ${closed.length || 'none'} closed and ${stillOpen.length || 'none'} still open.`,
              sourceIds: ticketCites,
            }),
          ]
        : []),
      ...listed(
        openGroups,
        openTicketLine,
        (n) => remaining(openGroups, n, 'more open request'),
        TICKET_LIMIT,
      ),
    ],

    changes: listed(
      closedGroups,
      resolvedLine,
      (n) => `Resolved ${remaining(closedGroups, n, 'more helpdesk request')}`,
      TICKET_LIMIT,
    ),

    'next-week': [
      ...listed(
        promises,
        promiseLine,
        (n) => `${plural(n, 'more action')} from meetings.`,
      ),
      ...listed(
        said('askedFor'),
        ({ meeting, point }) => ({
          text: `Asked for in “${meeting.title}”: ${sentence(point.text)}`,
          sourceIds: point.sourceIds,
        }),
        (n) => `${plural(n, 'more request')} from meetings.`,
      ),
    ],
  };

  // Summary: alerts and tickets in a line, then the week's meetings and what
  // came up in them.
  const clauses: Cited[] = [];
  if (devices.length > 0 || alerts.length > 0) {
    clauses.push(
      alerts.length === 0
        ? { text: 'no active alerts', sourceIds: deviceCites }
        : {
            text: `${plural(alerts.length, 'active alert')}${
              criticalAlerts.length === alerts.length
                ? alerts.length === 1
                  ? ', and it’s critical'
                  : ', all critical'
                : criticalAlerts.length > 0
                  ? `, ${criticalAlerts.length} of them critical`
                  : urgentAlerts.length === 0
                    ? ', none urgent'
                    : ''
            }`,
            sourceIds: alerts.map((item) => item.sourceIds[0]!),
          },
    );
  }
  if (tickets.length > 0) {
    clauses.push({
      text:
        opened.length === 0 && closed.length === 0
          ? 'no new helpdesk requests'
          : `${plural(opened.length, 'new helpdesk request')}, ${closed.length || 'none'} closed`,
      sourceIds: ticketCites,
    });
  }
  if (clauses.length > 0) {
    const text = clauses.map((c) => c.text).join('; ');
    lines.summary.push(
      line({
        text:
          urgent.length === 0
            ? `A quiet week: ${text}.`
            : `${text[0]!.toUpperCase()}${text.slice(1)}.`,
        sourceIds: clauses.flatMap((c) => c.sourceIds),
      }),
    );
  }
  lines.summary.push(
    ...listed(
      meetings,
      meetingLine,
      (n) => `${plural(n, 'more meeting')} this week.`,
    ),
    ...listed(
      [...said('planning'), ...said('concerns')],
      ({ meeting, point }) => ({
        text: `From “${meeting.title}”: ${sentence(point.text)}`,
        sourceIds: point.sourceIds,
      }),
      (n) => `${plural(n, 'more point')} from meetings.`,
    ),
  );

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
      `${plural(urgent.length, 'urgent item')} under Needs attention`,
    devices.length +
      tickets.length +
      attention.length +
      input.meetings.length +
      input.commitments.length ===
      0 && `Dossier has no records for ${client.name} yet`,
  ].filter((exception): exception is string => Boolean(exception));

  return {
    id: input.id,
    clientId: client.id,
    weekStart: week.start,
    weekEnd: week.end,
    status: 'draft',
    generatedAt: now,
    exceptions: [...new Set(exceptions)],
    approvedAt: null,
    editedAt: null,
    sentAt: null,
    title: `${client.name} weekly report`,
    glance: [
      { label: 'Devices', value: String(devices.length) },
      devices.length > 0
        ? {
            label: 'Patched',
            // Rounded down, so 100% means every device.
            value: `${Math.floor((patched / devices.length) * 100)}%`,
            note: `${patched} of ${devices.length}`,
          }
        : { label: 'Patched', value: '–', note: 'no devices' },
      {
        label: 'Alerts',
        value: String(alerts.length),
        note:
          criticalAlerts.length > 0
            ? `${criticalAlerts.length} critical`
            : urgentAlerts.length > 0
              ? `${urgentAlerts.length} urgent`
              : 'none urgent',
      },
      {
        label: 'Tickets',
        value: String(opened.length),
        note: `new, ${closed.length || 'none'} closed`,
      },
    ],
    sections: (Object.keys(SECTION_TITLES) as ReportSectionKind[]).map(
      (kind) => ({ kind, title: SECTION_TITLES[kind], lines: lines[kind] }),
    ),
    sources: snapshots,
  };
}
