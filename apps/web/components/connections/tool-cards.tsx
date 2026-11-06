'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Cascade } from '@/components/ui/cascade';
import { Folder } from '@/components/ui/folder';
import { IndexLoader } from '@/components/ui/index-loader';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useAppSelector } from '@/lib/store/hooks';
import { selectConnections } from '@/lib/store/connections-slice';
import { StateTag } from './state-tag';
import { ToolIcon } from './tool-icon';

/**
 * The four tools Dossier reads, from the browser's store: Dossier reading
 * until the first load, then the cards, cascading in and updated in place.
 */
export function ToolCards() {
  const connections = useAppSelector(selectConnections);

  if (connections.status === 'unknown') return <ToolCardsLoading />;
  if (connections.status === 'error') {
    return (
      <p
        role="alert"
        className="mt-8 animate-enter rounded-2xl bg-attention-soft px-5 py-6 text-small text-attention"
      >
        Dossier couldn’t load your connections. Try again in a moment.
      </p>
    );
  }

  return (
    <Cascade>
      <ul className="mt-8 grid gap-5 md:grid-cols-2">
        {connections.tools.map((tool) => (
          <li key={tool.id}>
            <Folder
              tone={tool.state === 'reconnect' ? 'act' : 'calm'}
              bodyClassName="flex min-h-48 flex-col p-5"
            >
              <h2 className="flex items-center gap-2 text-h3">
                <ToolIcon />
                <Link href={`/connections/${tool.id}`} className="rounded-sm">
                  {tool.name}
                </Link>
              </h2>
              <p className="mt-1 text-small text-muted">{tool.brings}</p>
              <div className="mt-4">
                <StateTag tool={tool} />
              </div>
              {/* Always two lines tall, so cards keep their size as states change. */}
              <p className="mt-1.5 min-h-[1.15rem] text-small text-muted">
                {tool.line}
              </p>
              <p className="mt-0.5 min-h-[1.05rem] text-[0.75rem] text-muted">
                {tool.scope}
              </p>
              {tool.syncing && (
                <ProgressBar label={`Syncing ${tool.name}`} className="mt-3" />
              )}
              <div className="mt-auto pt-4">
                <ButtonLink
                  href={`/connections/${tool.id}`}
                  variant={tool.state === 'connected' ? 'outline' : 'act'}
                  size="sm"
                >
                  {tool.state === 'connected'
                    ? 'Manage'
                    : tool.state === 'reconnect'
                      ? 'Fix'
                      : 'Connect'}
                </ButtonLink>
              </div>
            </Folder>
          </li>
        ))}
      </ul>
    </Cascade>
  );
}

/** Dossier reading, where the cards will be, the height of two rows. */
export function ToolCardsLoading() {
  return (
    <IndexLoader className="mt-8 h-[27rem]" label="Loading your connections" />
  );
}
