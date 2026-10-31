'use client';

import type { SupportGrant } from '@dossierhq/contracts';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { endSupportView } from '@/app/support-actions';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { StatusDot } from '@/components/ui/status-dot';
import { formatDateTime, formatTimestamp } from '@/lib/format';

/** Support views as a table, with a way to end those still running. */
export function SupportViews({
  views,
  showWorkspace,
  now,
}: {
  views: SupportGrant[];
  showWorkspace: boolean;
  /** When the page was read, so "running" doesn't shift while rendering. */
  now: string;
}) {
  return (
    <div className="overflow-x-auto rounded-card bg-sheet shadow-card">
      <table className="w-full min-w-200 text-left">
        <caption className="sr-only">Support views, newest first</caption>
        <thead className="text-meta text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Opened
            </th>
            {showWorkspace && (
              <th scope="col" className="px-4 py-2.5 font-medium">
                Workspace
              </th>
            )}
            <th scope="col" className="px-4 py-2.5 font-medium">
              Who, and why
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              State
            </th>
            <th scope="col" className="px-4 py-2.5">
              <span className="sr-only">End</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {views.map((view) => (
            <Row
              key={view.id}
              view={view}
              showWorkspace={showWorkspace}
              now={now}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  view,
  showWorkspace,
  now,
}: {
  view: SupportGrant;
  showWorkspace: boolean;
  now: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const running = view.endedAt === null && view.expiresAt > now;
  return (
    <tr>
      <td className="px-4 py-2.5 font-mono text-mono whitespace-nowrap text-muted">
        <time dateTime={view.createdAt} title={formatTimestamp(view.createdAt)}>
          {formatDateTime(view.createdAt)}
        </time>
      </td>
      {showWorkspace && (
        <td className="px-4 py-2.5">
          <Link
            href={`/workspaces/${view.workspaceId}/support`}
            className="text-ink underline-offset-2 hover:underline"
          >
            {view.workspaceName}
          </Link>
        </td>
      )}
      <td className="px-4 py-2.5 text-text">
        <span className="block" title={view.staff.email}>
          {view.staff.name}
        </span>
        <span className="block text-meta text-muted">{view.reason}</span>
      </td>
      <td className="px-4 py-2.5 text-meta text-text">
        {running ? (
          <>
            <Pill tone="positive" dot>
              {view.openedAt ? 'Open' : 'Link not used yet'}
            </Pill>
            <span className="mt-1 block text-muted">
              until {formatDateTime(view.expiresAt)} UTC
            </span>
          </>
        ) : (
          <span className="text-muted">
            Ended
            {view.endedBy ? `: ${view.endedBy}` : ''}
            {!view.openedAt && ', never opened'}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {running && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await endSupportView(view.id);
                if (!result.ok) setError(result.error);
              })
            }
          >
            {pending ? 'Ending…' : 'End now'}
          </Button>
        )}
        {error && (
          <StatusDot
            tone="failure"
            label={error}
            className="mt-1 text-meta-sm text-ink"
          />
        )}
      </td>
    </tr>
  );
}
