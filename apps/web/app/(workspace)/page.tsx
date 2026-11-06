import type { Metadata } from 'next';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getConnectors } from '@/lib/data/connectors';
import { orNull } from '@/lib/data/safe';
import { getWorkspace } from '@/lib/workspace';
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
  const connectors = await getConnectors().catch(orNull);
  // If the API can't say, Today rather than the first run.
  if (connectors && connectors.length === 0) return <FirstRun />;
  return (
    <Today
      workspace={getWorkspace()}
      fathomConnected={
        connectors?.some((connector) => connector.tool === 'fathom') ?? true
      }
    />
  );
}
