import type { Tool } from '@dossierhq/contracts';
import type { ReactNode } from 'react';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { SourceChip } from '@/components/ui/source-chip';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';

/**
 * Small stills of the product for the landing page's feature cards, drawn
 * with the app's own parts. Decorative: each card's text says what it shows.
 */
function Frame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'h-48 overflow-hidden rounded-tile bg-sheet p-4 shadow-card',
        className,
      )}
    >
      {children}
    </div>
  );
}

const ATTENTION: { tone: StatusTone; title: string; client: string }[] = [
  {
    tone: 'failure',
    title: 'HD-FS01 offline · 47 min',
    client: 'Harbour Dental',
  },
  {
    tone: 'strong',
    title: 'Patching failed · 3 devices',
    client: 'Northside Veterinary',
  },
  {
    tone: 'neutral',
    title: 'Disk 92% full on NS-DC02',
    client: 'Northside Veterinary',
  },
];

export function AttentionVignette() {
  return (
    <Frame className="p-0">
      <ul className="divide-y divide-hairline">
        {ATTENTION.map((row) => (
          <li key={row.title} className="flex gap-3 px-4 py-3">
            <StatusDot
              tone={row.tone}
              decorative
              className="mt-1.5 self-start"
            />
            <div className="min-w-0">
              <p className="truncate text-meta font-medium text-ink">
                {row.title}
              </p>
              <p className="text-meta-sm text-muted">{row.client}</p>
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

const EXPIRING = [
  { what: 'SSL certificate', where: 'cedarstreet.example', when: 'In 9 days' },
  { what: 'Domain renewal', where: 'marlowfinch.example', when: 'In 21 days' },
  {
    what: 'Firewall warranty',
    where: 'Harbour Dental',
    when: 'Expired 4 days ago',
    late: true,
  },
];

export function ExpiryVignette() {
  return (
    <Frame className="p-0">
      <ul className="divide-y divide-hairline">
        {EXPIRING.map((item) => (
          <li
            key={item.what}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-meta font-medium text-ink">
                {item.what}
              </p>
              <p className="truncate font-mono text-mono text-muted">
                {item.where}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-px text-meta-sm',
                item.late
                  ? 'bg-alert-soft text-alert'
                  : 'bg-surface text-muted',
              )}
            >
              {item.when}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function FollowUpVignette() {
  return (
    <Frame className="flex flex-col">
      <p className="font-mono text-mono text-muted">
        Fathom · 1 Oct · 00:14:32
      </p>
      <p className="mt-2 text-meta text-muted">Priya Nair, MSP</p>
      <p className="mt-1 text-body text-ink">
        <mark className="rounded-[3px] bg-marker-highlight px-0.5 text-ink">
          “We’ll send you the restore test results by Friday.”
        </mark>
      </p>
      <p className="mt-auto flex items-center gap-2 border-t border-hairline pt-3 text-meta text-ink">
        <StatusDot tone="strong" decorative />
        Still open after 15 days
      </p>
    </Frame>
  );
}

const SOURCES: { tool: Tool; name: string }[] = [
  { tool: 'ninjaone', name: 'Harbour Dental Ltd' },
  { tool: 'hudu', name: 'Harbour Dental' },
  { tool: 'fathom', name: 'harbourdental.co.uk' },
];

export function MergeVignette() {
  return (
    <Frame className="flex items-center">
      <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
        {SOURCES.map(({ tool, name }) => (
          <li
            key={tool}
            className="flex min-w-0 items-center gap-2 rounded-row bg-surface py-1.5 pr-2.5 pl-1.5"
          >
            <ConnectorTile tool={tool} size="sm" />
            <span className="truncate text-meta-sm text-text">{name}</span>
          </li>
        ))}
      </ul>
      <svg
        viewBox="0 0 32 112"
        fill="none"
        className="h-28 w-8 shrink-0 text-border-strong"
      >
        <path
          d="M0 18 C 18 18, 14 56, 32 56 M0 56 H32 M0 94 C 18 94, 14 56, 32 56"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
      <div className="w-22 shrink-0 rounded-tile bg-brand-soft px-3 py-3 text-center">
        <p className="text-figure text-brand-deep">1</p>
        <p className="text-meta-sm text-brand-deep">client</p>
      </div>
    </Frame>
  );
}

export function SourceVignette() {
  return (
    <Frame className="flex flex-col">
      <p className="text-body text-ink">
        File server HD-FS01 went offline at 09:12{' '}
        <SourceChip number={1} label="NinjaOne ALERT-48213" /> after patching
        failed on Monday <SourceChip number={2} label="NinjaOne PATCH-7720" />.
      </p>
      <div className="mt-auto flex flex-col gap-1 border-t border-hairline pt-3 font-mono text-mono text-muted">
        <p>
          <span className="text-ink">1</span> NinjaOne · ALERT-48213
        </p>
        <p>
          <span className="text-ink">2</span> NinjaOne · PATCH-7720
        </p>
      </div>
    </Frame>
  );
}

const READS = [
  ['09:12', 'NinjaOne', '214 devices'],
  ['09:12', 'Hudu', '61 assets'],
  ['09:13', 'SharePoint', '38 files'],
  ['09:13', 'Fathom', '4 meetings'],
] as const;

export function AuditVignette() {
  return (
    <Frame>
      <dl className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2.5 font-mono text-mono">
        {READS.map(([time, tool, what]) => (
          <div key={tool} className="contents">
            <dt className="text-muted tabular-nums">{time}</dt>
            <dd className="text-ink">{tool}</dd>
            <dd className="text-right text-muted">read {what}</dd>
          </div>
        ))}
      </dl>
    </Frame>
  );
}
