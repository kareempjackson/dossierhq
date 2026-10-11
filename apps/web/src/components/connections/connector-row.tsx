'use client';

import type { Tool } from '@dossierhq/contracts';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';

/** One connected tool, with its details behind Manage. */
export function ConnectorRow({
  tool,
  name,
  scope,
  access,
  status,
  details,
}: {
  tool: Tool;
  name: string;
  scope: string;
  access: string;
  status: { tone: StatusTone; label: string };
  details: { label: string; value: string }[];
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4">
        <ConnectorTile tool={tool} />
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-medium text-ink">{name}</p>
          <p className="text-meta text-muted">{scope}</p>
          <p className="mt-0.5 font-mono text-mono break-words text-muted">
            {access}
          </p>
        </div>
        <StatusDot
          tone={status.tone}
          label={status.label}
          className="text-meta text-text"
        />
        <Button
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
        >
          Manage<span className="sr-only"> {name}</span>
        </Button>
      </div>
      <div id={detailsId} hidden={!open} className="mx-4 mb-4">
        <dl className="grid gap-x-6 gap-y-2 rounded-tile bg-surface-soft p-4 text-meta sm:grid-cols-[auto_1fr]">
          {details.map((detail) => (
            <div key={detail.label} className="contents">
              <dt className="text-muted">{detail.label}</dt>
              <dd className="text-ink">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </li>
  );
}
