import { SourceChip } from '@/components/ui/source-chip';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';

type PreviewRow = {
  tone: StatusTone;
  client: string;
  urgency?: 'Critical' | 'High';
  title: string;
  kind: string;
  source: string;
};

const ROWS: PreviewRow[] = [
  {
    tone: 'failure',
    client: 'Harbour Dental',
    urgency: 'Critical',
    title: 'File server HD-FS01 offline for 47 minutes',
    kind: 'Alert',
    source: 'NinjaOne · ALERT-48213 · 16 Oct, 09:12',
  },
  {
    tone: 'strong',
    client: 'Northside Veterinary',
    urgency: 'High',
    title: 'Patching failed on 3 devices',
    kind: 'Risk',
    source: 'NinjaOne · PATCH-7731 · 16 Oct, 03:00',
  },
  {
    tone: 'neutral',
    client: 'Cedar Street Clinic',
    title: 'SSL certificate expires in 9 days',
    kind: 'Risk',
    source: 'Hudu · EXP-1184 · 15 Oct, 18:40',
  },
  {
    tone: 'neutral',
    client: 'Marlow & Finch',
    title: 'Send the restore test results, promised two weeks ago',
    kind: 'Commitment',
    source: 'Fathom · 1 Oct · 00:14:32 · Priya Nair, MSP',
  },
];

const AT_A_GLANCE = [
  ['Devices', '38'],
  ['Servers', '2'],
  ['Open', '3'],
] as const;

/**
 * The hero's still: the home page's "Needs attention" list drawn with the
 * same parts, a client at a glance behind it, and the record behind its
 * first line in front. Fictional clients; one image to assistive tech.
 */
export function HeroVisual({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="An example Needs attention list: a file server offline at Harbour Dental, failed patching at Northside Veterinary, an expiring certificate at Cedar Street Clinic and a follow-up promised to Marlow & Finch, each with the record it came from."
      className={cn('relative', className)}
    >
      <div className="absolute -top-14 -right-2 hidden w-72 rounded-tile bg-sheet p-4 shadow-glow sm:block xl:-right-10">
        <div className="flex items-center justify-between gap-3">
          <p className="text-section font-semibold text-ink">Harbour Dental</p>
          <StatusDot tone="failure" decorative />
        </div>
        <p className="mt-0.5 font-mono text-mono text-muted">
          harbourdental.co.uk
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {AT_A_GLANCE.map(([label, value]) => (
            <div key={label} className="rounded-row bg-surface px-2.5 py-2">
              <p className="text-meta-sm text-muted">{label}</p>
              <p className="text-figure text-ink tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative rounded-sheet bg-sheet p-4 shadow-glow sm:mt-16 sm:mr-10 sm:p-5">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <p className="text-section font-semibold text-ink">
            Needs attention
            <span className="ml-1.5 font-normal text-muted tabular-nums">
              4
            </span>
          </p>
          <p className="text-meta text-muted">Most urgent first</p>
        </div>
        <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-card bg-sheet shadow-float">
          {ROWS.map((row) => (
            <li key={row.title} className="flex gap-3 px-4 py-3.5">
              <StatusDot
                tone={row.tone}
                decorative
                className="mt-[7px] self-start"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-meta text-muted">
                    {row.client}
                    {row.urgency && ' · '}
                    {row.urgency && (
                      <span
                        className={
                          row.urgency === 'Critical' ? 'text-alert' : 'text-ink'
                        }
                      >
                        {row.urgency}
                      </span>
                    )}
                  </p>
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-px text-meta-sm text-muted">
                    {row.kind}
                  </span>
                </div>
                <p className="mt-0.5 font-medium text-ink">{row.title}</p>
                <p className="mt-1 truncate font-mono text-mono text-muted">
                  {row.source}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative -mt-6 mr-4 ml-8 rounded-tile bg-sheet p-4 shadow-glow sm:mr-auto sm:w-80 lg:-ml-8">
        <p className="flex items-center gap-2 text-meta text-muted">
          <SourceChip number={1} label="NinjaOne ALERT-48213" />
          Where this came from
        </p>
        <p className="mt-2 font-mono text-mono text-muted">
          NinjaOne · ALERT-48213
        </p>
        <p className="mt-1 text-meta text-text">
          <mark className="rounded-[3px] bg-marker-highlight px-0.5 text-ink">
            HD-FS01 has not checked in since 09:12.
          </mark>{' '}
          Last seen on the Harbour Dental site network.
        </p>
      </div>
    </div>
  );
}
