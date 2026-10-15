import type { Connector } from '@dossierhq/contracts';
import type { StatusTone } from '@/components/ui/status-dot';
import { formatDateTime, formatRelative } from './format';

/** A connector's state in a few words, with the tone of its dot. */
export function connectorStatus(
  connector: Connector,
  now: string,
  timeZone: string,
): { tone: StatusTone; label: string } {
  if (connector.status === 'failing') {
    const since = connector.failure?.since ?? connector.lastSyncAt ?? now;
    return {
      tone: 'failure',
      label: `Failing since ${formatDateTime(since, timeZone)}`,
    };
  }
  if (connector.status === 'syncing') {
    return {
      tone: 'neutral',
      label: connector.lastSyncAt ? 'Syncing now' : 'First sync running',
    };
  }
  return connector.lastSyncAt
    ? {
        tone: 'positive',
        label: `Synced ${formatRelative(connector.lastSyncAt, now, timeZone)}`,
      }
    : { tone: 'neutral', label: 'Waiting for its first sync' };
}
