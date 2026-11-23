import {
  sourceOrigin,
  type AttentionItem,
  type Client,
  type ClientListItem,
  type Connector,
  type Pattern,
  type Recommendation,
  type ShellReport,
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

/** The most things Home lists for each client; its file has the rest. */
const CLIENT_ITEMS = 3;
/** The most clients Home lists that need you; Needs attention has the rest. */
const CLIENT_GROUPS = 5;
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

/**
 * One client that needs you, with the top of its Overview: what needs
 * attention, most urgent first, then Dossier's newest drafts waiting for a
 * decision.
 */
export type TodayGroup = {
  clientId: string;
  clientName: string;
  /** Everything that needs attention there, shown or not. */
  total: number;
  /** The top few: attention items first, then drafts, "Draft ready". */
  items: OverviewItem[];
  /** How many of Dossier's drafts wait for a decision there. */
  drafts: number;
};

export type TodayView = {
  /** Clients with anything needing attention or a draft to decide on. */
  needing: number;
  /** Things needing attention, across every client. */
  attention: number;
  /** Dossier's drafts waiting for a decision, across every client. */
  drafts: number;
  clientCount: number;
  /** e.g. "4 min ago"; null before Dossier first read a tool. */
  lastRead: string | null;
  /** The clients that need you, most urgent first, and what each needs. */
  groups: TodayGroup[];
  /** Clients that need you beyond those listed. */
  moreGroups: number;
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
    attention,
    recommendations,
    sources,
  }: {
    /** Most urgent first, as GET /clients/overview orders them. */
    clients: ClientListItem[];
    /** Most recently opened first. */
    recent: Client[];
    connectors: Connector[];
    /** Every client's, most urgent first; null when the API couldn't say. */
    attention: AttentionItem[] | null;
    /** Every client's drafts, newest first. */
    recommendations: Recommendation[];
    /** The records the listed items cite. */
    sources: Map<string, Source>;
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

  // Each client that needs you, in the overview's order: something needs
  // attention there, or a draft waits for a decision.
  const needing = clients
    .map(({ client }) => ({
      client,
      attention: (attention ?? []).filter(
        (item) => item.clientId === client.id,
      ),
      drafts: recommendations.filter(
        (rec) => rec.clientId === client.id && rec.status === 'draft',
      ),
    }))
    .filter((each) => each.attention.length + each.drafts.length > 0);
  const groups = needing
    .slice(0, CLIENT_GROUPS)
    .map(({ client, attention: items, drafts }): TodayGroup => {
      const overview = clientOverview(
        {
          client,
          attention: items,
          drafts,
          meetings: [],
          users: [],
          sources,
        },
        when,
      );
      // What needs attention first, then the newest drafts, to fill up.
      const shown = overview.items.slice(0, CLIENT_ITEMS);
      const drafted = drafts
        .slice(0, CLIENT_ITEMS - shown.length)
        .map((rec): OverviewItem => ({
          id: rec.id,
          title: rec.title,
          cite: null,
          detail: `Drafted by Dossier · ${ago(rec.createdAt, when.now, when.timeZone)}`,
          status: { tone: 'drafted', label: 'Draft ready' },
          source: null,
        }));
      return {
        clientId: client.id,
        clientName: client.name,
        total: overview.items.length,
        items: [...shown, ...drafted],
        drafts: drafts.length,
      };
    });

  return {
    needing: needing.length,
    attention: rows.reduce((sum, row) => sum + row.attention, 0),
    drafts: needing.reduce((sum, each) => sum + each.drafts.length, 0),
    clientCount: rows.length,
    lastRead: read ? ago(read, when.now, when.timeZone) : null,
    groups,
    moreGroups: Math.max(0, needing.length - groups.length),
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
    folders: folders.map((row) => {
      // Drafts waiting say so, when nothing more pressing does.
      const drafts = recommendations.filter(
        (rec) => rec.clientId === row.id && rec.status === 'draft',
      ).length;
      const summary = clientLine(row);
      return {
        id: row.id,
        name: row.name,
        tone: row.tone,
        summary:
          drafts > 0 && summary === 'All quiet'
            ? `${drafts === 1 ? '1 draft' : `${drafts} drafts`} to review`
            : summary,
      };
    }),
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

/**
 * The records Home's lists cite: the top few items of each client listed
 * as needing you, to read them in one go.
 */
export const todaySourceIds = (
  clients: ClientListItem[],
  attention: AttentionItem[],
): string[] =>
  clients
    .map(({ client }) =>
      attention
        .filter((item) => item.clientId === client.id)
        .slice(0, CLIENT_ITEMS),
    )
    .filter((items) => items.length > 0)
    .slice(0, CLIENT_GROUPS)
    .flat()
    .flatMap((item) => item.sourceIds);

/** What the command palette jumps to: every client, and the week's reports. */
export function paletteData(
  {
    clients,
    reports,
  }: {
    clients: ClientListItem[];
    /** Drafts to review, then those approved and not sent yet. */
    reports: ShellReport[];
  },
  when: When,
): { clients: PaletteClient[]; reports: PaletteReport[] } {
  const week = (weekStart: string) =>
    `Week of ${calendarDay(weekStart, when.timeZone, when.now)}`;
  const names = new Map(clients.map(({ client }) => [client.id, client.name]));
  const nameOf = (id: string) => names.get(id) ?? id;
  return {
    clients: clientRows(clients, null, when).map((row) => ({
      id: row.id,
      name: row.name,
      summary: clientLine(row),
      needsYou: row.tone !== 'calm',
    })),
    reports: reports.map((report) => ({
      id: report.id,
      clientName: nameOf(report.clientId),
      week: week(report.weekStart),
    })),
  };
}
