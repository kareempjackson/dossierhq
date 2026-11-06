'use client';

import type { Tool } from '@dossierhq/contracts';
import { Cascade } from '@/components/ui/cascade';
import { IndexLoader } from '@/components/ui/index-loader';
import type { ToolGuide } from '@/lib/catalog';
import { useAppSelector } from '@/lib/store/hooks';
import { selectConnections } from '@/lib/store/connections-slice';
import { ConnectTool } from './connect-tool';

/**
 * One tool's panel, from the browser's store: Dossier reading until the
 * first load, then the tool, cascading in and updated in place by each
 * refresh.
 */
export function ToolPanel({ id, guide }: { id: Tool; guide: ToolGuide }) {
  const connections = useAppSelector(selectConnections);

  if (connections.status === 'unknown') return <ToolPanelLoading />;
  if (connections.status === 'error') {
    return (
      <p
        role="alert"
        className="animate-enter rounded-2xl bg-attention-soft px-5 py-6 text-small text-attention"
      >
        Dossier couldn’t load this connection. Try again in a moment.
      </p>
    );
  }

  const tool = connections.tools.find((each) => each.id === id);
  if (!tool) return null;
  return (
    <Cascade>
      <ConnectTool
        tool={tool}
        guide={guide}
        others={connections.tools.filter((each) => each.id !== id)}
        recentReads={connections.recentReads[id] ?? null}
        canManage={connections.canManage}
        signIn={
          id === 'ninjaone'
            ? {
                redirectUri: connections.redirectUri,
                problem: connections.signInProblem,
              }
            : undefined
        }
      />
    </Cascade>
  );
}

/** Dossier reading, where the panel will be, about its height. */
export function ToolPanelLoading() {
  return <IndexLoader className="h-[40rem]" label="Loading this connection" />;
}
