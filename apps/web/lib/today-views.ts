import {
  sourceOrigin,
  type AttentionItem,
  type Client,
  type ClientListItem,
  type Connector,
  type OutboxItem,
  type Pattern,
  type Recommendation,
  type ReportSummary,
  type Source,
} from '@dossierhq/contracts';
import { RENEWAL_SOON_DAYS, renewsIn } from './client-paths';
import {
  clientOverview,
  clientRows,
  lastRead,
  type ClientRow,
  type FolderTone,
  type OverviewItem,
  type When,
} from './client-views';
import { ago, calendarDay, fullTime } from './format';
import type { PaletteClient, PaletteReport } from './store/shell-slice';

/**
 * Today (Home) and the command palette, worked out from the API's records
 * at the moment the page is drawn, in the workspace's time zone. Pure: the
 * pages read the API and pass the results in.
 */

/** The most things the focus folder lists; the client's file has the rest. */
const FOCUS_ITEMS = 5;
/** The folders under "Your clients". */
const FOLDERS = 6;
/** The renewals under "This week". */
const RENEWALS = 3;

/** The line under a client's name: what its file needs, if anything. */
export function clientLine(row: ClientRow): string {
  if (row.attention > 0) {
    return row.attention === 1
      ? '1 needs attention'
      : `${row.attention} need attention`;
  }
  if (row.renewal && row.renewal.inDays <= RENEWAL_SOON_DAYS) {
    return `Renews ${renewsIn(row.renewal.inDays)}`;
  }
  return row.tone === 'drafted' ? 'Report drafted' : 'All quiet';
}

export type TodayFolder = {
  id: string;
  name: string;
  tone: FolderTone;
  summary: string;
};

export type TodayFocus = {
  clientId: string;
  clientName: string;
  /** Everything that needs attention there, shown or not. */
  total: number;
  items: OverviewItem[];
  /** Dossier drafted something there to review. */
  hasDraft: boolean;
};

export type TodayView = {
  /** Clients with anything needing attention. */
  needing: number;
  /** Things needing attention, across every client. */
  attention: number;
  clientCount: number;
  /** e.g. "4 min ago"; null before Dossier first read a tool. */
  lastRead: string | null;
  /** The client that needs you most, and what it needs. */
  focus: TodayFocus | null;
  /** Up for renewal soonest. */
  renewals: { clientId: string; name: string; what: string; when: string }[];
  /** Recently opened first, then the most urgent. */
  folders: TodayFolder[];
};

export function todayView(
  {
    clients,
    recent,
    connectors,
    focus,
  }: {
    /** Most urgent first, as GET /clients/overview orders them. */
    clients: ClientListItem[];
    /** Most recently opened first. */
    recent: Client[];
    connectors: Connector[];
    /** The focus client's records; null when nothing needs attention. */
    focus: {
      client: Client;
      attention: AttentionItem[];
      /** Newest first. */
      drafts: Recommendation[];
      sources: Map<string, Source>;
    } | null;
  },
  when: When,
): TodayView {
  const rows = clientRows(clients, null, when);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const read = lastRead(connectors);

  const opened = recent
    .map((client) => byId.get(client.id))
    .filter((row): row is ClientRow => row !== undefined);
  const folders = [
    ...opened,
    ...rows.filter((row) => !opened.includes(row)),
  ].slice(0, FOLDERS);

  const overview = focus
    ? clientOverview(
        {
          client: focus.client,
          attention: focus.attention,
          drafts: focus.drafts,
          meetings: [],
          users: [],
          sources: focus.sources,
        },
        when,
      )
    : null;

  return {
    needing: rows.filter((row) => row.attention > 0).length,
    attention: rows.reduce((sum, row) => sum + row.attention, 0),
    clientCount: rows.length,
    lastRead: read ? ago(read, when.now, when.timeZone) : null,
    focus:
      focus && overview && overview.items.length > 0
        ? {
            clientId: focus.client.id,
            clientName: focus.client.name,
            total: overview.items.length,
            items: overview.items.slice(0, FOCUS_ITEMS),
            hasDraft: overview.draft !== null,
          }
        : null,
    renewals: rows
      .filter(
        (
          row,
        ): row is ClientRow & { renewal: NonNullable<ClientRow['renewal']> } =>
          row.renewal !== null && row.renewal.inDays <= RENEWAL_SOON_DAYS,
      )
      .sort((a, b) => a.renewal.inDays - b.renewal.inDays)
      .slice(0, RENEWALS)
      .map((row) => ({
        clientId: row.id,
        name: row.name,
        what: row.renewal.what,
        when: renewsIn(row.renewal.inDays),
      })),
    folders: folders.map((row) => ({
      id: row.id,
      name: row.name,
      tone: row.tone,
      summary: clientLine(row),
    })),
  };
}

/** The most patterns Home shows; the API keeps them most important first. */
const PATTERNS = 6;

export type PatternCard = {
  id: string;
  title: string;
  /** Why it matters across these clients. */
  why: string;
  /** What to do about it, once, for all of them. */
  suggestion: string;
  /** e.g. "3 hours ago", and the full time for a title. */
  found: string;
  foundFull: string;
  /** Two or more, each with the facts there and a record to check. */
  clients: {
    id: string;
    name: string;
    detail: string;
    source: { name: string; url: string } | null;
  }[];
};

/** The records a pattern rests on: the first behind each client's facts. */
export const patternSourceIds = (patterns: Pattern[]) =>
  patterns
    .slice(0, PATTERNS)
    .flatMap((pattern) =>
      pattern.clients.flatMap((client) => client.sourceIds.slice(0, 1)),
    );

/**
 * The same problem at several clients, as Home shows it. Clients no longer
 * listed drop out, and a pattern left with one client isn't one.
 */
export function patternCards(
  patterns: Pattern[],
  clients: ClientListItem[],
  sources: Map<string, Source>,
  { timeZone, now }: When,
): PatternCard[] {
  const names = new Map(
    clients.map((item) => [item.client.id, item.client.name]),
  );
  return patterns
    .map((pattern) => ({
      id: pattern.id,
      title: pattern.title,
      why: pattern.why,
      suggestion: pattern.suggestion,
      found: ago(pattern.createdAt, now, timeZone),
      foundFull: fullTime(pattern.createdAt, timeZone),
      clients: pattern.clients.flatMap((client) => {
        const name = names.get(client.clientId);
        if (!name) return [];
        const source = client.sourceIds
          .map((id) => sources.get(id))
          .find(Boolean);
        return [
          {
            id: client.clientId,
            name,
            detail: client.detail,
            source: source
              ? { name: sourceOrigin(source), url: source.url }
              : null,
          },
        ];
      }),
    }))
    .filter((card) => card.clients.length >= 2)
    .slice(0, PATTERNS);
}

/** The client the focus folder is about: the most urgent, if any need you. */
export const focusClient = (clients: ClientListItem[]) =>
  clients.find((item) => item.attention.total > 0)?.client ?? null;

/** What the command palette jumps to: every client, and the week's reports. */
export function paletteData(
  {
    clients,
    queue,
    outbox,
    names,
  }: {
    clients: ClientListItem[];
    /** Drafts to review. */
    queue: ReportSummary[];
    /** Approved, not sent yet. */
    outbox: OutboxItem[];
    names: Map<string, string>;
  },
  when: When,
): { clients: PaletteClient[]; reports: PaletteReport[] } {
  const week = (weekStart: string) =>
    `Week of ${calendarDay(weekStart, when.timeZone, when.now)}`;
  const nameOf = (id: string) => names.get(id) ?? id;
  return {
    clients: clientRows(clients, null, when).map((row) => ({
      id: row.id,
      name: row.name,
      summary: clientLine(row),
      needsYou: row.tone !== 'calm',
    })),
    reports: [
      ...queue.map((report) => ({
        id: report.id,
        clientName: nameOf(report.clientId),
        week: week(report.weekStart),
      })),
      ...outbox.map((item) => ({
        id: item.reportId,
        clientName: nameOf(item.clientId),
        week: week(item.weekStart),
      })),
    ],
  };
}
