import {
  TOOL_NAMES,
  toolSchema,
  type Connector,
  type Tool,
} from '@dossierhq/contracts';

/**
 * A tool as the Connections screens show it, worked out from the API's
 * connector (or its absence) at the moment the page is drawn, in the
 * workspace's time zone.
 */
export type ToolStatus = {
  id: Tool;
  name: string;
  /** What it brings in. */
  brings: string;
  /** Off: not connected. Reconnect: connected, but its syncs are failing. */
  state: 'connected' | 'reconnect' | 'off';
  /** A sync is running now. */
  syncing: boolean;
  /** "Synced 4 min ago", "First sync running", "Failing since …"; empty when off. */
  line: string;
  /** Where it reads from, e.g. "eu.ninjarmm.com"; empty when off. */
  account: string;
  /** What it read, e.g. "RMM · 14 clients · 612 devices"; empty when off. */
  scope: string;
  /** e.g. "5 Nov 2026, 10:37", or "Not yet". */
  lastGoodSync: string;
  failure: {
    summary: string;
    /** The way out, as a button: "Update NinjaOne settings" or "Try again". */
    fix: string;
    since: string;
  } | null;
};

const BRINGS: Record<Tool, string> = {
  ninjaone: 'Devices, alerts and patching',
  hudu: 'Assets, domains and expiry dates',
  sharepoint: 'Files by client',
  fathom: 'Meetings and follow-ups',
};

/** Every tool Dossier reads, connected or not, in the API's order. */
export function toolStatuses(
  connectors: Connector[],
  now: Date,
  timeZone: string,
): ToolStatus[] {
  return toolSchema.options.map((tool) => {
    const connector = connectors.find((each) => each.tool === tool);
    const name = TOOL_NAMES[tool];
    if (!connector) {
      return {
        id: tool,
        name,
        brings: BRINGS[tool],
        state: 'off',
        syncing: false,
        line: '',
        account: '',
        scope: '',
        lastGoodSync: 'Not yet',
        failure: null,
      };
    }
    const when = (at: string) => dateTime(at, timeZone);
    return {
      id: tool,
      name,
      brings: BRINGS[tool],
      state: connector.status === 'failing' ? 'reconnect' : 'connected',
      syncing: connector.status === 'syncing',
      line:
        connector.status === 'syncing'
          ? connector.lastSyncAt
            ? 'Syncing now'
            : 'First sync running'
          : connector.status === 'failing' && connector.failure
            ? `Failing since ${when(connector.failure.since)}`
            : connector.lastSyncAt
              ? `Synced ${ago(connector.lastSyncAt, now)}`
              : 'Waiting for its first sync',
      account: connector.account,
      scope: connector.scope,
      lastGoodSync: connector.lastSyncAt
        ? when(connector.lastSyncAt)
        : 'Not yet',
      failure: connector.failure
        ? {
            summary: connector.failure.summary,
            fix: connector.failure.fix,
            since: when(connector.failure.since),
          }
        : null,
    };
  });
}

/** "5 Nov 2026, 10:37". */
function dateTime(at: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(at));
}

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
function ago(at: string, now: Date) {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(at).getTime()) / 60_000),
  );
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
