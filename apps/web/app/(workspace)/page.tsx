import type { Metadata } from 'next';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { overviewSourceIds } from '@/lib/client-views';
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
  focusClient,
  patternCards,
  patternSourceIds,
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

  const fathomConnected =
    connectors?.some((connector) => connector.tool === 'fathom') ?? true;
  if (!clients || !me) {
    return (
      <Today view={null} patterns={[]} fathomConnected={fathomConnected} />
    );
  }

  // The client that needs you most: what needs attention there, and
  // whether Dossier drafted something, as its Overview tab shows them.
  const client = focusClient(clients);
  const [attention, drafts] = client
    ? await Promise.all([
        getAttention(client.id).catch(orNull),
        getRecommendations(client.id, 'draft').catch(orNull),
      ])
    : [null, null];
  // One read for every record cited: the focus client's and the patterns'.
  const sourceIds = [
    ...(client && attention ? overviewSourceIds(attention, drafts ?? []) : []),
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
      focus:
        client && attention
          ? { client, attention, drafts: drafts ?? [], sources }
          : null,
    },
    when,
  );
  return (
    <Today
      view={view}
      patterns={patternCards(patterns, clients, sources, when)}
      fathomConnected={fathomConnected}
    />
  );
}
