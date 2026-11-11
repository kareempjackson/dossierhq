import {
  SUMMARY_FIELD,
  WEEKDAY_NAMES,
  sourceOrigin,
  ticketTechnicians,
  type AttentionItem,
  type Client,
  type ClientListItem,
  type ClientTheme,
  type Commitment,
  type Connector,
  type Device,
  type EndUser,
  type EndUserDetail,
  type Meeting,
  type Recommendation,
  type ReportSettings,
  type ReportSummary,
  type Source,
  type Ticket,
  type UnattachedMeeting,
  type Urgency,
} from '@dossierhq/contracts';
import type { CitedFile } from '@/components/ui/cited-stack';
import type { TagTone } from '@/components/ui/tag';
import {
  RENEWAL_SOON_DAYS,
  STUCK_AFTER_DAYS,
  andList,
  meetingHref,
} from './client-paths';
import {
  ago,
  calendarDay,
  dayIn,
  dayMonth,
  dayMonthTime,
  daysUntil,
  fullTime,
  plural,
} from './format';

/**
 * What the clients screens show, worked out from the API's records at the
 * moment the page is drawn, in the workspace's time zone. Pure: the pages
 * read the API and pass the results in.
 */

export type Status = { tone: TagTone; label: string };

type When = { timeZone: string; now: Date };

/** A source's field, by its label in the tool's own terms. */
const field = (source: Source | undefined, label: string) =>
  source?.fields.find((each) => each.label === label)?.value ?? null;

/** When Dossier last finished reading any tool; null before the first read. */
export function lastRead(connectors: Connector[]): string | null {
  return (
    connectors
      .flatMap((connector) => connector.lastSyncAt ?? [])
      .sort()
      .at(-1) ?? null
  );
}

const URGENCY: Record<Urgency, Status> = {
  critical: { tone: 'attention', label: 'Critical' },
  high: { tone: 'act', label: 'High' },
  normal: { tone: 'neutral', label: 'Normal' },
};

// The clients list ------------------------------------------------------------

export type ClientStatus = 'attention' | 'renewal' | 'healthy';

/** The folder's colour: act on it, Dossier drafted something, or calm. */
export type FolderTone = 'act' | 'drafted' | 'calm';

export type ClientRow = {
  id: string;
  name: string;
  tone: FolderTone;
  status: ClientStatus;
  /** How many things need attention there. */
  attention: number;
  /** The contract's renewal, when one is on file. */
  renewal: { what: string; inDays: number } | null;
  /** Null when the devices couldn't be read. */
  devices: number | null;
  /** e.g. "30 Oct"; null before any meeting. */
  lastMeeting: string | null;
};

/** Every client, most urgent first, as the API orders them. */
export function clientRows(
  items: ClientListItem[],
  /** Every device in the workspace; null if they couldn't be read. */
  devices: Device[] | null,
  { timeZone, now }: When,
): ClientRow[] {
  const deviceCount = new Map<string, number>();
  for (const device of devices ?? []) {
    deviceCount.set(
      device.clientId,
      (deviceCount.get(device.clientId) ?? 0) + 1,
    );
  }
  return items.map(({ client, attention, lastMeetingAt, latestReport }) => {
    const renewal = client.contract
      ? {
          what: client.contract.plan,
          inDays: daysUntil(client.contract.renewsOn, timeZone, now),
        }
      : null;
    const status: ClientStatus =
      attention.total > 0
        ? 'attention'
        : renewal && renewal.inDays <= RENEWAL_SOON_DAYS
          ? 'renewal'
          : 'healthy';
    return {
      id: client.id,
      name: client.name,
      tone:
        status !== 'healthy'
          ? 'act'
          : latestReport?.status === 'draft'
            ? 'drafted'
            : 'calm',
      status,
      attention: attention.total,
      renewal,
      devices: devices ? (deviceCount.get(client.id) ?? 0) : null,
      lastMeeting: lastMeetingAt
        ? dayMonth(lastMeetingAt, timeZone, now)
        : null,
    };
  });
}

/** "Dental practice · Portsmouth · 22 seats", or null when nothing's known. */
export function clientSummary(client: Client): string | null {
  const parts = [
    client.industry,
    client.location,
    client.seats != null ? plural(client.seats, 'seat') : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// Citations -------------------------------------------------------------------

/**
 * Numbers the records a screen cites, in the order they're first cited,
 * and keeps them as files for the cited-files stack.
 */
function citations(sources: Map<string, Source>, { timeZone, now }: When) {
  const files: (CitedFile & { url: string })[] = [];
  const numbers = new Map<string, number>();
  const cite = (id: string): number | null => {
    const known = numbers.get(id);
    if (known) return known;
    const source = sources.get(id);
    if (!source) return null;
    files.push({
      id: source.id,
      source: sourceOrigin(source),
      date: dayMonth(source.recordedAt, timeZone, now),
      title: source.title,
      url: source.url,
    });
    numbers.set(id, files.length);
    return files.length;
  };
  return { files, cite };
}

// Overview --------------------------------------------------------------------

export type OverviewItem = {
  id: string;
  title: string;
  /** The cited file it rests on; null if Dossier no longer holds it. */
  cite: number | null;
  /** e.g. "Raised 3 days ago · Ticket 4821". */
  detail: string;
  status: Status;
  /** The tool it came from, and the record there. */
  source: { name: string; url: string } | null;
};

export type OverviewDraft = {
  id: string;
  title: string;
  reason: string;
  /** The cited files it rests on. */
  from: number[];
};

export type OverviewContact = {
  name: string;
  role: string;
  /** e.g. "30 Oct"; null when no recorded meeting shows them. */
  lastSpoke: string | null;
  meetingId: string | null;
  /** Their page under Users; null when the API doesn't list them. */
  userId: string | null;
};

export type ClientOverview = {
  items: OverviewItem[];
  draft: OverviewDraft | null;
  /** Drafts after this one, waiting their turn. */
  moreDrafts: number;
  contact: OverviewContact | null;
  /** In citation order. */
  cited: CitedFile[];
};

/** Letters only, so "Priya  Nair", "priya.nair" and `PriyaNair` meet. */
const letters = (name: string) => name.toLowerCase().replace(/[^\p{L}]/gu, '');

/**
 * What needs attention (most urgent first), Dossier's newest draft, the
 * key contact, and the records they rest on.
 */
export function clientOverview(
  {
    client,
    attention,
    drafts,
    meetings,
    users,
    sources,
  }: {
    client: Client;
    attention: AttentionItem[];
    /** Draft recommendations, newest first. */
    drafts: Recommendation[];
    /** Newest first. */
    meetings: Meeting[];
    /** The people who work there. */
    users: EndUser[];
    sources: Map<string, Source>;
  },
  when: When,
): ClientOverview {
  const { files, cite } = citations(sources, when);

  const items = attention.map((item): OverviewItem => {
    const { sourceId, ...row } = attentionRow(item, sources, when);
    return { ...row, cite: sourceId ? cite(sourceId) : null };
  });

  const [newest] = drafts;
  const draft = newest
    ? {
        id: newest.id,
        title: newest.title,
        reason: newest.reason,
        from: [
          ...new Set(
            newest.sourceIds
              .map(cite)
              .filter((number): number is number => number !== null),
          ),
        ],
      }
    : null;

  const contact = client.primaryContact;
  const spoke = contact
    ? meetings.find((meeting) =>
        meeting.attendees.some(
          (attendee) => letters(attendee.name) === letters(contact.name),
        ),
      )
    : undefined;

  return {
    items,
    draft,
    moreDrafts: Math.max(0, drafts.length - 1),
    contact: contact
      ? {
          name: contact.name,
          role: contact.role,
          lastSpoke: spoke
            ? dayMonth(spoke.occurredAt, when.timeZone, when.now)
            : null,
          meetingId: spoke?.id ?? null,
          userId: users.find((user) => user.primaryContact)?.id ?? null,
        }
      : null,
    cited: files.map(({ id, source, date, title }) => ({
      id,
      source,
      date,
      title,
    })),
  };
}

/**
 * One thing needing attention, as a row: the first of its records Dossier
 * still holds says where it came from.
 */
function attentionRow(
  item: AttentionItem,
  sources: Map<string, Source>,
  { timeZone, now }: When,
): Omit<OverviewItem, 'cite'> & { sourceId: string | null } {
  const first = item.sourceIds.map((id) => sources.get(id)).find(Boolean);
  return {
    id: item.id,
    title: item.title,
    detail: [
      `Raised ${ago(item.raisedAt, now, timeZone)}`,
      first ? `${first.recordType} ${first.recordId}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    status: URGENCY[item.urgency],
    source: first ? { name: sourceOrigin(first), url: first.url } : null,
    sourceId: first?.id ?? null,
  };
}

/** The source ids an overview cites, to read them in one go. */
export function overviewSourceIds(
  attention: AttentionItem[],
  drafts: Recommendation[],
): string[] {
  return [
    ...attention.flatMap((item) => item.sourceIds),
    ...(drafts[0]?.sourceIds ?? []),
  ];
}

// Devices ---------------------------------------------------------------------

export type DeviceRow = {
  id: string;
  name: string;
  user: string | null;
  /** Who signs in to it, as a person under Users; null if not known. */
  userId: string | null;
  os: string;
  patching: Status;
  /** e.g. "4 min ago". */
  lastSeen: string;
  online: boolean;
  needsAttention: boolean;
  /** The detail panel's facts, in order. */
  facts: { label: string; value: string }[];
  /** What needs attention on it, most urgent first. */
  attention: string[];
  /** Dossier's draft recommendation about it, if there is one. */
  suggestion: string | null;
  /** The device in NinjaOne. */
  remoteUrl: string | null;
};

const PATCHING: Record<Device['patchStatus'], Status> = {
  current: { tone: 'healthy', label: 'Current' },
  pending: { tone: 'act', label: 'Pending' },
  failed: { tone: 'attention', label: 'Failed' },
};

const DEVICE_TYPE: Record<Device['type'], string> = {
  workstation: 'Workstation',
  laptop: 'Laptop',
  server: 'Server',
  network: 'Network device',
};

/** Without NinjaOne's own word, a device unseen this long counts as offline. */
const OFFLINE_AFTER_MS = 24 * 3_600_000;

/** Needing work first, then by name, as the API orders them. */
export function deviceRows(
  {
    devices,
    sources,
    attention,
    drafts,
    users = [],
  }: {
    devices: Device[];
    /** The devices' own records, by id. */
    sources: Map<string, Source>;
    attention: AttentionItem[];
    drafts: Recommendation[];
    /** The people who work there, to name who signs in to each device. */
    users?: EndUser[];
  },
  { timeZone, now }: When,
): DeviceRow[] {
  const userOf = new Map(
    users.flatMap((user) => user.deviceIds.map((id) => [id, user] as const)),
  );
  return devices.map((device) => {
    const person = userOf.get(device.id);
    const source = sources.get(device.sourceId);
    const status = field(source, 'Status');
    const online =
      status === 'Online'
        ? true
        : status === 'Offline'
          ? false
          : now.getTime() - Date.parse(device.lastSeenAt) < OFFLINE_AFTER_MS;
    const about = attention.filter((item) =>
      item.sourceIds.includes(device.sourceId),
    );
    const suggestion = drafts.find((draft) =>
      draft.sourceIds.includes(device.sourceId),
    );
    const model = field(source, 'Model');
    return {
      id: device.id,
      name: device.name,
      user: person?.name ?? device.assignedTo,
      userId: person?.id ?? null,
      os: device.os,
      patching: PATCHING[device.patchStatus],
      lastSeen: ago(device.lastSeenAt, now, timeZone),
      online,
      needsAttention:
        device.patchStatus !== 'current' || !online || about.length > 0,
      facts: [
        { label: 'Type', value: DEVICE_TYPE[device.type] },
        ...(model ? [{ label: 'Model', value: model }] : []),
        { label: 'Status', value: online ? 'Online' : 'Offline' },
        { label: 'Patching', value: PATCHING[device.patchStatus].label },
        {
          label: 'Last seen',
          value: dayMonthTime(device.lastSeenAt, timeZone, now),
        },
      ],
      attention: about.map((item) => item.title),
      suggestion: suggestion?.title ?? null,
      remoteUrl: source?.url ?? null,
    };
  });
}

// Files -----------------------------------------------------------------------

export type FileRow = {
  id: string;
  name: string;
  changedBy: string | null;
  /** e.g. "30 Oct". */
  changed: string;
  changedAt: string;
  /** The file in SharePoint. */
  url: string;
};

export type FolderView = { id: string; name: string; files: FileRow[] };

export type ClientFiles = {
  /** SharePoint is connected. */
  connected: boolean;
  /** The client's folder in SharePoint, joined by name; null if none matched. */
  folder: string | null;
  /** e.g. "4 min ago"; null before the first read. */
  read: string | null;
  /** The folder that changed last first. */
  folders: FolderView[];
  total: number;
};

/** The name of the group for files straight in the client's folder. */
const TOP_LEVEL = 'Top level';

/** The client's SharePoint files, by subfolder. */
export function isSharePointFile(source: Source): boolean {
  return (
    source.kind === 'record' &&
    source.tool === 'sharepoint' &&
    source.recordType === 'File'
  );
}

export function clientFiles(
  sources: Source[],
  sharePoint: Connector | undefined,
  { timeZone, now }: When,
): ClientFiles {
  const files = sources.filter(isSharePointFile);
  const folders = new Map<string, FolderView>();
  let folder: string | null = null;
  // Sources come newest first, so each folder's first file is its latest.
  for (const source of files) {
    const path = field(source, 'Folder') ?? '';
    const slash = path.indexOf('/');
    folder ??= slash === -1 ? path || null : path.slice(0, slash);
    const sub = slash === -1 ? '' : path.slice(slash + 1);
    const id = sub || '.';
    const group = folders.get(id) ?? { id, name: sub || TOP_LEVEL, files: [] };
    group.files.push({
      id: source.id,
      name: source.title,
      changedBy: field(source, 'Modified by'),
      changed: dayMonth(source.recordedAt, timeZone, now),
      changedAt: source.recordedAt,
      url: source.url,
    });
    folders.set(id, group);
  }
  return {
    connected: sharePoint !== undefined,
    folder,
    read: sharePoint?.lastSyncAt
      ? ago(sharePoint.lastSyncAt, now, timeZone)
      : null,
    folders: [...folders.values()],
    total: files.length,
  };
}

// Meetings --------------------------------------------------------------------

export type MeetingPromise = {
  id: string;
  title: string;
  /** e.g. "Due 12 Nov", or when in the meeting it was said. */
  due: string;
  status: Status;
};

export type MeetingView = {
  id: string;
  title: string;
  /** e.g. "30 Oct". */
  date: string;
  minutes: number;
  /** The client's side first. */
  attendees: string[];
  /** Fathom's own summary, as plain text; null when it has none. */
  summary: string | null;
  /** Dossier has read the meeting for plans, concerns and asks. */
  read: boolean;
  promises: MeetingPromise[];
  /** What the client said they plan, worry about and asked for. */
  points: string[];
  /** The recording, in Fathom. */
  url: string | null;
};

/** A promise said this long after a meeting's end still counts as its own. */
const PROMISE_SLACK_MS = 10 * 60_000;

/** The client's promises said during the meeting, or just after it. */
function promisesIn(meeting: Meeting, commitments: Commitment[]) {
  const start = Date.parse(meeting.occurredAt);
  const end = start + meeting.durationMinutes * 60_000 + PROMISE_SLACK_MS;
  return commitments.filter((commitment) => {
    const at = Date.parse(commitment.madeAt);
    return commitment.clientId === meeting.clientId && at >= start && at <= end;
  });
}

/** Everyone in the meeting once, the client's side first. */
function attendeeNames(meeting: Meeting): string[] {
  // Fathom can list someone twice (invited, and joined); name them once.
  return [
    ...new Set(
      [
        ...meeting.attendees.filter((each) => each.role === 'client'),
        ...meeting.attendees.filter((each) => each.role === 'msp'),
      ].map((each) => each.name),
    ),
  ];
}

/** Newest first, each with what was promised in it. */
export function meetingViews(
  {
    meetings,
    commitments,
    recordings,
  }: {
    meetings: Meeting[];
    commitments: Commitment[];
    /** The Fathom recordings, by source id. */
    recordings: Map<string, Source>;
  },
  { timeZone, now }: When,
): MeetingView[] {
  const today = dayIn(now, timeZone);
  return meetings.map((meeting) => {
    const start = Date.parse(meeting.occurredAt);
    const recording = recordings.get(meeting.recordingSourceId);
    const summary = field(recording, SUMMARY_FIELD);
    return {
      id: meeting.id,
      title: meeting.title,
      date: dayMonth(meeting.occurredAt, timeZone, now),
      minutes: meeting.durationMinutes,
      attendees: attendeeNames(meeting),
      summary: summary ? plainText(summary) : null,
      read: meeting.readAt !== null,
      promises: promisesIn(meeting, commitments).map((commitment) => ({
        id: commitment.id,
        title: commitment.statement,
        due: commitment.dueOn
          ? `Due ${calendarDay(commitment.dueOn, timeZone, now)}`
          : `Said ${Math.max(0, Math.round((Date.parse(commitment.madeAt) - start) / 60_000))} min in`,
        status:
          commitment.status === 'done'
            ? { tone: 'healthy', label: 'Done' }
            : commitment.dueOn && commitment.dueOn < today
              ? { tone: 'attention', label: 'Overdue' }
              : { tone: 'act', label: 'Open' },
      })),
      points: [
        ...meeting.planning,
        ...meeting.concerns,
        ...meeting.askedFor,
      ].map((point) => point.text),
      url: recording?.url ?? null,
    };
  });
}

/** A meeting on the Meetings page, among every client's. */
export type MeetingRow = {
  id: string;
  title: string;
  /** The client it was with; a dash when its name couldn't be read. */
  client: string;
  /** e.g. "30 Oct · 45 min". */
  when: string;
  /** e.g. "Thursday 30 October 2026, 14:05 AST", for a title attribute. */
  at: string;
  /** e.g. "Helen Okoro, Sam Reid, Ana Li and 2 more"; empty without names. */
  attendees: string;
  /** "2 open" (overdue in red) or "All done"; null when nothing was promised. */
  promises: Status | null;
  /** The client's Meetings tab, opened on this one. */
  href: string;
};

/** Attendees named before "and N more". */
const ATTENDEES_SHOWN = 3;

/** Every client's meetings as the API gave them (newest first), as rows. */
export function meetingRows(
  {
    meetings,
    commitments,
    clientNames,
  }: {
    meetings: Meeting[];
    /** Every client's, or none when they couldn't be read. */
    commitments: Commitment[];
    clientNames: Map<string, string>;
  },
  { timeZone, now }: When,
): MeetingRow[] {
  const today = dayIn(now, timeZone);
  return meetings.map((meeting) => {
    const promised = promisesIn(meeting, commitments);
    const open = promised.filter((commitment) => commitment.status === 'open');
    const overdue = open.some(
      (commitment) => commitment.dueOn !== null && commitment.dueOn < today,
    );
    const names = attendeeNames(meeting);
    return {
      id: meeting.id,
      title: meeting.title,
      client: clientNames.get(meeting.clientId) ?? '—',
      when: `${dayMonth(meeting.occurredAt, timeZone, now)} · ${meeting.durationMinutes} min`,
      at: fullTime(meeting.occurredAt, timeZone),
      attendees:
        names.length > ATTENDEES_SHOWN + 1
          ? `${names.slice(0, ATTENDEES_SHOWN).join(', ')} and ${names.length - ATTENDEES_SHOWN} more`
          : andList(names),
      promises:
        promised.length === 0
          ? null
          : open.length === 0
            ? { tone: 'healthy', label: 'All done' }
            : {
                tone: overdue ? 'attention' : 'act',
                label: `${open.length} open`,
              },
      href: meetingHref(meeting.clientId, meeting.id),
    };
  });
}

/** A recorded meeting no client matched, to attach to one by hand. */
export type UnmatchedRow = {
  id: string;
  title: string;
  /** e.g. "30 Oct · 45 min". */
  when: string;
  /** e.g. "Thursday 30 October 2026, 14:05 AST", for a title attribute. */
  at: string;
  /** The outside invitees' email domains, or that there were none. */
  invited: string;
  /** The recording, in Fathom; null when Fathom gave none. */
  url: string | null;
};

/** Meetings Fathom's last sync couldn't place (newest first), as rows. */
export function unmatchedRows(
  meetings: UnattachedMeeting[],
  { timeZone, now }: When,
): UnmatchedRow[] {
  return meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    when: `${dayMonth(meeting.occurredAt, timeZone, now)} · ${meeting.durationMinutes} min`,
    at: fullTime(meeting.occurredAt, timeZone),
    invited:
      meeting.domains.length > 0
        ? `Invited from ${andList(meeting.domains)}`
        : 'No one invited from outside',
    url: meeting.url || null,
  }));
}

/**
 * Fathom's Markdown summary as text to read: headings and emphasis go,
 * links keep their words, list items get a bullet.
 */
export function plainText(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*[-*+]\s+/, '• ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(^|\W)[*_](\S.*?)[*_](?=\W|$)/g, '$1$2')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Reports ---------------------------------------------------------------------

export type ReportRow = {
  id: string;
  /** e.g. "Week of 26 Oct". */
  week: string;
  status: Status;
  /** Waiting for someone to review it. */
  toReview: boolean;
  /** e.g. "2 Nov"; null until it goes. */
  sent: string | null;
  /** "Clean", or how many things Dossier wants a person to check. */
  checks: string;
};

/** Newest week first. */
export function reportRows(
  reports: ReportSummary[],
  { timeZone, now }: When,
): ReportRow[] {
  return reports.map((report) => ({
    id: report.id,
    week: `Week of ${calendarDay(report.weekStart, timeZone, now)}`,
    status:
      report.status === 'draft'
        ? { tone: 'drafted', label: 'To review' }
        : report.status === 'skipped'
          ? { tone: 'neutral', label: 'Skipped' }
          : report.sentAt
            ? { tone: 'healthy', label: 'Sent' }
            : { tone: 'act', label: 'Approved' },
    toReview: report.status === 'draft',
    sent: report.sentAt ? dayMonth(report.sentAt, timeZone, now) : null,
    checks:
      report.exceptions.length === 0
        ? 'Clean'
        : plural(report.exceptions.length, 'thing to check', 'things to check'),
  }));
}

/** "on Mondays at 09:00", or null when approved reports aren't sent on a schedule. */
export function sendsOn(settings: ReportSettings): string | null {
  if (!settings.sendAt) return null;
  const { weekday, hour } = settings.sendAt;
  return `on ${WEEKDAY_NAMES[weekday - 1]}s at ${String(hour).padStart(2, '0')}:00`;
}

// Tickets ---------------------------------------------------------------------

export type TicketRow = {
  id: string;
  /** The ticket's number in NinjaOne, e.g. "4821". */
  number: string;
  title: string;
  priority: Status;
  /** NinjaOne's word for where it's at, e.g. "Waiting on client". */
  status: string;
  /** Who started it, as Dossier read the conversation; else NinjaOne's requester. */
  reportedBy: string | null;
  /** Who worked it: the first, and "+2" for more; "Unassigned" for no one. */
  technician: string;
  /** Everyone who worked it, for the cell's title. */
  technicians: string[];
  open: boolean;
  /** Open, and no update for over a week. */
  stuck: boolean;
  closedThisMonth: boolean;
};

export type TicketPattern = {
  title: string;
  body: string;
  /** The latest ticket it rests on, to open. */
  ticket: string | null;
};

export const priorityOf = (urgency: Urgency): Status => URGENCY[urgency];

/** Open first (most urgent, then latest), then closed, as the API orders them. */
export function ticketRows(
  tickets: Ticket[],
  { timeZone, now }: When,
): TicketRow[] {
  const month = dayIn(now, timeZone).slice(0, 7);
  // A ticket merged into another is part of that one.
  return tickets
    .filter((ticket) => !ticket.mergedInto)
    .map((ticket) => {
      const technicians = ticketTechnicians(ticket);
      return {
        id: ticket.id,
        number: ticket.number,
        title: ticket.subject,
        priority: URGENCY[ticket.urgency],
        status: ticket.status,
        reportedBy: ticket.requester,
        technician:
          technicians.length === 0
            ? 'Unassigned'
            : technicians.length === 1
              ? technicians[0]!
              : `${technicians[0]} +${technicians.length - 1}`,
        technicians,
        open: ticket.open,
        stuck:
          ticket.open &&
          now.getTime() - Date.parse(ticket.updatedAt) >
            STUCK_AFTER_DAYS * 86_400_000,
        closedThisMonth:
          !ticket.open &&
          dayIn(new Date(ticket.updatedAt), timeZone).slice(0, 7) === month,
      };
    });
}

/** What keeps coming back, from the first theme the API lists. */
export function ticketPattern(
  themes: ClientTheme[],
  tickets: Ticket[],
): TicketPattern | null {
  const [theme] = themes;
  if (!theme) return null;
  const latest = tickets
    .filter((ticket) => theme.ticketIds.includes(ticket.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    title: theme.title,
    body: theme.summary,
    ticket: latest?.number ?? null,
  };
}

// Users -----------------------------------------------------------------------

export type UserRow = {
  id: string;
  name: string;
  /** e.g. "Practice manager · Primary contact · priya@… · Signs in as PriyaN". */
  facts: string;
  primaryContact: boolean;
  devices: number;
  /** Tickets they're on: ones they raised and others they took part in. */
  tickets: number;
  /** Of those, the ones they raised. */
  ticketsRaised: number;
  openTickets: number;
  meetings: number;
  /** e.g. "3 days ago"; null before any ticket or meeting. */
  lastContact: string | null;
  /** Everything they can be found by, lowercased. */
  search: string;
};

/** What's known about someone besides their records, in one line. */
function userFacts(user: EndUser): string {
  return [
    user.role,
    user.primaryContact ? 'Primary contact' : null,
    // Someone known only by email is already named by it.
    user.email && user.email !== user.name.toLowerCase() ? user.email : null,
    user.signIns.length > 0 ? `Signs in as ${andList(user.signIns)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The people at a client, by name, as the API lists them. */
export function userRows(users: EndUser[], { timeZone, now }: When): UserRow[] {
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    facts: userFacts(user),
    primaryContact: user.primaryContact,
    devices: user.deviceIds.length,
    tickets: user.tickets,
    ticketsRaised: user.ticketsRaised,
    openTickets: user.openTickets,
    meetings: user.meetings,
    lastContact: user.lastContactAt
      ? ago(user.lastContactAt, now, timeZone)
      : null,
    search: [user.name, user.email, user.role, ...user.signIns]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }));
}

/** A line Dossier wrote, and the tool and record the first of it rests on. */
export type ReadLine = {
  text: string;
  source: { name: string; url: string } | null;
};

export type PersonMeeting =
  | {
      kind: 'meeting';
      id: string;
      title: string;
      date: string;
      /** Their own words, as Dossier read them: plans, worries, asks. */
      said: { label: string; text: string }[];
    }
  | { kind: 'notes'; id: string; title: string; date: string };

export type PersonView = {
  id: string;
  name: string;
  facts: string;
  /** What Dossier read about them; null until it has. */
  profile: {
    summary: string;
    recurring: ReadLine[];
    devices: ReadLine[];
    openLoops: ReadLine[];
    /** How they've sounded lately; for the MSP's team only. */
    tone: string | null;
    /** e.g. "2 days ago". */
    read: string;
  } | null;
  attention: Omit<OverviewItem, 'cite'>[];
  devices: DeviceRow[];
  /** Tickets they raised. */
  tickets: TicketRow[];
  /** Tickets someone else raised that they're on. */
  involvedTickets: TicketRow[];
  meetings: PersonMeeting[];
};

const TONE: Record<
  NonNullable<EndUserDetail['profile']>['tone']['trend'],
  string | null
> = {
  improving: 'Sounding better lately',
  steady: 'Sounding steady',
  worsening: 'Sounding worse lately',
  unknown: null,
};

/** Every source a person's page cites, to read them in one go. */
export function personSourceIds(detail: EndUserDetail): string[] {
  const profile = detail.profile;
  return [
    ...detail.attention.flatMap((item) => item.sourceIds),
    ...detail.devices.map((device) => device.sourceId),
    ...(profile
      ? [...profile.recurring, ...profile.devices, ...profile.openLoops]
      : []
    ).flatMap((line) => line.sourceIds),
  ];
}

/** One person at a client, with everything the tools say about them. */
export function personView(
  detail: EndUserDetail,
  sources: Map<string, Source>,
  when: When,
): PersonView {
  const { user, profile } = detail;
  const line = (cited: { text: string; sourceIds: string[] }): ReadLine => {
    const first = cited.sourceIds.map((id) => sources.get(id)).find(Boolean);
    return {
      text: cited.text,
      source: first ? { name: sourceOrigin(first), url: first.url } : null,
    };
  };
  return {
    id: user.id,
    name: user.name,
    facts: userFacts(user),
    profile: profile
      ? {
          summary: profile.summary,
          recurring: profile.recurring.map(line),
          devices: profile.devices.map(line),
          openLoops: profile.openLoops.map(line),
          tone:
            [TONE[profile.tone.trend], profile.tone.note]
              .filter(Boolean)
              .join('. ') || null,
          read: ago(profile.readAt, when.now, when.timeZone),
        }
      : null,
    attention: detail.attention.map((item) =>
      attentionRow(item, sources, when),
    ),
    devices: deviceRows(
      {
        devices: detail.devices,
        sources,
        attention: detail.attention,
        drafts: [],
        users: [user],
      },
      when,
    ),
    tickets: ticketRows(detail.tickets, when),
    involvedTickets: ticketRows(detail.involvedTickets, when),
    meetings: detail.meetings.map((meeting): PersonMeeting =>
      meeting.kind === 'meeting'
        ? {
            kind: 'meeting',
            id: meeting.id,
            title: meeting.title,
            date: dayMonth(meeting.occurredAt, when.timeZone, when.now),
            said: [
              ...meeting.said.planning.map((point) => ({
                label: 'Planning',
                text: point.text,
              })),
              ...meeting.said.concerns.map((point) => ({
                label: 'Worried about',
                text: point.text,
              })),
              ...meeting.said.askedFor.map((point) => ({
                label: 'Asked for',
                text: point.text,
              })),
            ],
          }
        : {
            kind: 'notes',
            id: meeting.id,
            title: meeting.title,
            date: calendarDay(meeting.occurredOn, when.timeZone, when.now),
          },
    ),
  };
}
