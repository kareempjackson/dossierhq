import { toolSchema } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getMe } from '@/lib/data/auth';
import {
  getAttention,
  getRecommendations,
  getSources,
} from '@/lib/data/client-records';
import { getClientList, getRecentClients } from '@/lib/data/clients';
import { getConnectors } from '@/lib/data/connectors';
import { getPatterns } from '@/lib/data/intelligence';
import { orNull } from '@/lib/data/safe';
import {
  patternCards,
  patternSourceIds,
  todaySourceIds,
  todayView,
} from '@/lib/today-views';
import { FirstRun } from './first-run';
import { Today } from './today';

export const metadata: Metadata = { title: 'Home' };

/** Today once anything is connected; until then, how to get started. */
export default function HomePage() {
  return (
    <Reveal fallback={<IndexLoader className="h-[31rem]" />}>
      <Home />
    </Reveal>
  );
}

async function Home() {
  const [connectors, clients, recent, me, patterns] = await Promise.all([
    getConnectors().catch(orNull),
    getClientList().catch(orNull),
    getRecentClients(6).catch(orNull),
    getMe().catch(orNull),
    // Patterns are extra: Home stands without them.
    getPatterns().catch(() => []),
  ]);
  // If the API can't say, Today rather than the first run.
  if (connectors && connectors.length === 0) return <FirstRun />;

  // The tools not connected yet; none when the API can't say.
  const missing = connectors
    ? toolSchema.options.filter(
        (tool) => !connectors.some((each) => each.tool === tool),
      )
    : [];
  if (!clients || !me) {
    return <Today view={null} patterns={[]} missing={missing} />;
  }

  // What needs attention at every client, and Dossier's drafts waiting for
  // a decision, as each client's Overview tab shows them.
  const [attention, recommendations] = await Promise.all([
    getAttention().catch(orNull),
    getRecommendations(undefined, 'draft').catch(() => []),
  ]);
  // One read for every record cited: the listed items' and the patterns'.
  const sourceIds = [
    ...(attention ? todaySourceIds(clients, attention) : []),
    ...patternSourceIds(patterns),
  ];
  const sources =
    sourceIds.length > 0
      ? ((await getSources(sourceIds).catch(orNull)) ?? new Map())
      : new Map();

  const when = { timeZone: me.workspace.timeZone, now: new Date() };
  const view = todayView(
    {
      clients,
      recent: recent ?? [],
      connectors: connectors ?? [],
      attention,
      recommendations,
      sources,
    },
    when,
  );
  return (
    <Today
      view={view}
      patterns={patternCards(patterns, clients, sources, when)}
      missing={missing}
    />
  );
}
