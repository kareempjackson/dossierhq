import type { Source } from '@dossierhq/contracts';
import { deviceSource, devices } from './devices';
import { meetingSources, recordingSources } from './meetings';
import { reportSources } from './reports';
import { keySources } from './sources';

export { auditLog, connectors } from './connectors';
export { devices } from './devices';
export { attentionItems, commitments, recommendations } from './insights';
export { meetings } from './meetings';
export { reports, weekNumber, weeks } from './reports';
export { clients, NOW, recentClientIds, workspace } from './world';

/** Every source record, keyed by ID. Device records are built on demand. */
const sourceById = new Map<string, Source>(
  [...keySources, ...meetingSources, ...recordingSources, ...reportSources].map(
    (source) => [source.id, source],
  ),
);
const deviceBySourceId = new Map(devices.map((d) => [d.sourceId, d]));

export function findSource(id: string): Source | undefined {
  const found = sourceById.get(id);
  if (found) return found;
  const device = deviceBySourceId.get(id);
  return device ? deviceSource(device) : undefined;
}

export function sourcesForClient(clientId: string): Source[] {
  return [...sourceById.values()].filter((s) => s.clientId === clientId);
}
