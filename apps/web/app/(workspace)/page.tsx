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
import { orNull } from '@/lib/data/safe';
import { focusClient, todayView } from '@/lib/today-views';
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
  const [connectors, clients, recent, me] = await Promise.all([
    getConnectors().catch(orNull),
    getClientList().catch(orNull),
    getRecentClients(6).catch(orNull),
    getMe().catch(orNull),
  ]);
  // If the API can't say, Today rather than the first run.
  if (connectors && connectors.length === 0) return <FirstRun />;

  const fathomConnected =
    connectors?.some((connector) => connector.tool === 'fathom') ?? true;
  if (!clients || !me) {
    return <Today view={null} fathomConnected={fathomConnected} />;
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
  const sources =
    client && attention
      ? ((await getSources(overviewSourceIds(attention, drafts ?? [])).catch(
          orNull,
        )) ?? new Map())
      : new Map();

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
    { timeZone: me.workspace.timeZone, now: new Date() },
  );
  return <Today view={view} fathomConnected={fathomConnected} />;
}
