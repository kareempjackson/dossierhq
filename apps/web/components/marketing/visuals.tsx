import type { ReactNode } from 'react';
import { Mark } from '@/components/brand/logo';
import { Tag, type TagTone } from '@/components/ui/tag';
import { cn } from '@/lib/cn';
import { ToolMark, ToolTile, type ToolName } from './tool-mark';

/** The small product scenes beside each feature: drawn in the app's own parts, not screenshots. */

const ToolDot = ({ name }: { name: ToolName }) => (
  <span className="hidden size-6 shrink-0 place-items-center rounded-md bg-white text-[0.5625rem] font-medium text-muted ring-1 ring-grey-2 sm:grid">
    {name.slice(0, 1)}
  </span>
);

function Row({
  title,
  detail,
  tag,
  tool,
}: {
  title: string;
  detail: string;
  tag: { tone: TagTone; label: string };
  tool: ToolName;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-grey-1 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-medium">{title}</p>
        <p className="truncate text-[0.6875rem] text-muted">{detail}</p>
      </div>
      <Tag tone={tag.tone} className="h-5 text-[0.6875rem]">
        {tag.label}
      </Tag>
      <ToolDot name={tool} />
    </li>
  );
}

function MiniTabs({ tabs }: { tabs: [string, number?][] }) {
  return (
    <div className="flex gap-1 overflow-hidden">
      {tabs.map(([label, count], index) => (
        <span
          key={label}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-t-lg px-2.5 py-1 text-[0.6875rem]',
            index === 0 ? 'bg-white text-ink' : 'bg-grey-3 text-muted',
          )}
        >
          {label}
          {count !== undefined && (
            <span className="rounded-full bg-grey-1 px-1 font-mono text-[0.5625rem]">
              {count}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** A grey stage that holds a scene. */
export function Stage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative rounded-3xl bg-grey-2 p-4 sm:p-10 xl:p-14',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ConnectScene() {
  return (
    <div aria-hidden className="mx-auto max-w-sm xl:max-w-md">
      <p className="text-center text-[0.625rem] tracking-[0.12em] text-muted">
        READ-ONLY
      </p>
      <div className="mt-2 grid grid-cols-4 gap-2 rounded-2xl bg-grey-1 p-2">
        {(['NinjaOne', 'Hudu', 'SharePoint', 'Fathom'] as const).map((tool) => (
          <ToolTile
            key={tool}
            name={tool}
            className="h-11 px-1 text-[0.625rem]"
          />
        ))}
      </div>
      <div className="mx-auto h-5 w-px bg-stone" />
      <div className="rounded-2xl bg-grey-1 p-2 pb-2.5">
        <MiniTabs
          tabs={[['Overview'], ['Devices', 12], ['Files', 38], ['Meetings', 6]]}
        />
        <div className="rounded-xl rounded-tl-none bg-white p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-ink text-[0.625rem] text-paper">
              HD
            </span>
            <div className="flex-1">
              <p className="text-small font-medium">Harbour Dental</p>
              <p className="text-[0.625rem] text-muted">
                Client file · read 4 min ago
              </p>
            </div>
            <Mark height={12} />
          </div>
          <p className="mt-3 text-[0.5625rem] tracking-[0.1em] text-muted">
            WHAT NEEDS ATTENTION
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            <Row
              title="Backups failing on 2 workstations"
              detail="Since 26 Oct"
              tag={{ tone: 'attention', label: 'Attention' }}
              tool="NinjaOne"
            />
            <Row
              title="harbourdental.co.uk expires in 12 days"
              detail="Auto-renew is off"
              tag={{ tone: 'act', label: '12 days' }}
              tool="Hudu"
            />
            <Row
              title="You promised a firewall quote"
              detail="Call with Sarah, 28 Oct"
              tag={{ tone: 'drafted', label: 'Draft ready' }}
              tool="Fathom"
            />
          </ul>
        </div>
      </div>
    </div>
  );
}

export function MorningScene() {
  return (
    <div aria-hidden className="relative mx-auto max-w-sm xl:max-w-md pb-16">
      <div className="rounded-2xl bg-grey-1 p-2 pb-2.5">
        <MiniTabs
          tabs={[
            ['Needs attention', 3],
            ['Renewals', 5],
            ['Healthy', 39],
          ]}
        />
        <div className="rounded-xl rounded-tl-none bg-white p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-h3">Good morning, David.</p>
              <p className="text-[0.625rem] text-muted">
                3 clients need you · 214 records read
              </p>
            </div>
            <Mark height={14} />
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            <Row
              title="Backups failing on 2 workstations"
              detail="Harbour Dental · since 26 Oct"
              tag={{ tone: 'attention', label: 'Attention' }}
              tool="NinjaOne"
            />
            <Row
              title="Domain expires in 12 days"
              detail="Northgate Legal · auto-renew off"
              tag={{ tone: 'act', label: '12 days' }}
              tool="Hudu"
            />
            <Row
              title="Firewall quote promised"
              detail="Kiln Studio · call on 28 Oct"
              tag={{ tone: 'drafted', label: 'Draft ready' }}
              tool="Fathom"
            />
          </ul>
        </div>
      </div>
      <div className="absolute right-0 bottom-0 w-64 rounded-2xl bg-lilac-soft p-3.5 shadow-float sm:-right-10">
        <p className="flex items-center gap-1.5 text-[0.6875rem] text-lilac-ink">
          <Mark height={10} />
          Drafted by Dossier · from 1 and 3
        </p>
        <p className="mt-1.5 text-[0.75rem]">
          Fix the two failing backups and send the firewall quote before Friday.
        </p>
        <div className="mt-3 flex gap-1.5">
          <span className="rounded-full bg-ink px-3 py-1 text-[0.6875rem] text-paper">
            Accept
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-[0.6875rem] ring-1 ring-stone">
            Edit
          </span>
        </div>
      </div>
    </div>
  );
}

const Cite = ({ n }: { n: number }) => (
  <sup className="font-mono text-[0.5625rem] text-lilac-ink">{n}</sup>
);

export function CiteScene() {
  return (
    <div
      aria-hidden
      className="mx-auto max-w-sm xl:max-w-md rounded-2xl bg-grey-1 p-2 pb-2.5"
    >
      <MiniTabs tabs={[['Ask Dossier']]} />
      <div className="rounded-xl rounded-tl-none bg-white p-3">
        <p className="ml-auto w-fit rounded-xl bg-grey-2 px-3 py-2 text-[0.6875rem]">
          What does Harbour Dental need this week?
        </p>
        <p className="mt-3 flex items-center gap-1.5 text-[0.625rem] text-muted">
          <Mark height={10} className="text-ink" />
          Dossier
        </p>
        <p className="mt-1 text-small">
          Fix two failing{' '}
          <span className="whitespace-nowrap">
            backups <Cite n={1} />
          </span>
          , renew the domain before{' '}
          <span className="whitespace-nowrap">
            16 Nov <Cite n={2} />
          </span>
          , and send Sarah the firewall{' '}
          <span className="whitespace-nowrap">
            quote <Cite n={3} />.
          </span>
        </p>
        <p className="mt-3 text-[0.5625rem] tracking-[0.1em] text-muted">
          SOURCES
        </p>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {(
            [
              ['Backup job report', 'NinjaOne · 2 Nov, 06:12', 'NinjaOne'],
              ['Asset: harbourdental.co.uk', 'Hudu · updated 31 Oct', 'Hudu'],
              ['Call with Sarah', 'Fathom · 28 Oct, 12 min', 'Fathom'],
            ] as const
          ).map(([title, detail, tool], index) => (
            <li
              key={title}
              className="flex items-center gap-2.5 rounded-lg bg-grey-1 px-2.5 py-2"
            >
              <ToolDot name={tool} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.75rem] font-medium">{title}</p>
                <p className="text-[0.625rem] text-muted">{detail}</p>
              </div>
              <span className="grid size-5 place-items-center rounded bg-lilac-soft font-mono text-[0.5625rem] text-lilac-ink">
                {index + 1}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ReportScene() {
  return (
    <div aria-hidden className="mx-auto max-w-sm xl:max-w-md">
      <div className="rounded-2xl bg-grey-1 p-2 pb-2.5">
        <MiniTabs
          tabs={[
            ['To review', 5],
            ['Approved', 12],
            ['Questions', 4],
          ]}
        />
        <div className="rounded-xl rounded-tl-none bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-h3">Harbour Dental</p>
              <p className="text-[0.625rem] text-muted">
                Weekly report · 26 Oct to 1 Nov
              </p>
            </div>
            <Tag tone="attention" className="h-5 text-[0.625rem]">
              Needs a look
            </Tag>
          </div>
          <div className="mt-3 rounded-lg bg-grey-1 p-3 text-[0.75rem]">
            <p className="text-muted">Did any backups fail this week?</p>
            <p className="mt-0.5">
              Yes, on 2 PCs. We are fixing them this week. <Cite n={1} />
            </p>
            <p className="mt-2.5 text-muted">Is anyone still on Windows 10?</p>
            <p className="mt-0.5">
              No. Every PC runs Windows 11. <Cite n={4} />
            </p>
          </div>
          <div className="mt-3 flex gap-1.5">
            <span className="rounded-full bg-lime px-4 py-1 text-[0.6875rem]">
              Approve
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-[0.6875rem] ring-1 ring-stone">
              Edit
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-[0.6875rem] ring-1 ring-stone">
              Regenerate
            </span>
          </div>
        </div>
      </div>
      <div className="mx-auto h-5 w-px bg-stone" />
      <div className="flex items-center gap-2 rounded-2xl bg-grey-1 p-2">
        <span className="px-2 text-[0.5625rem] leading-tight tracking-[0.1em] text-muted">
          CITED
          <br />
          FROM
        </span>
        {(['NinjaOne', 'Hudu', 'SharePoint', 'Fathom'] as const).map((tool) => (
          <ToolTile
            key={tool}
            name={tool}
            className="h-10 flex-1 px-1 text-[0.5625rem]"
          />
        ))}
      </div>
    </div>
  );
}

/** For How it works: the tools, read-only. */
export function ReadCard() {
  return (
    <div aria-hidden className="rounded-xl bg-white p-3">
      <div className="grid grid-cols-2 gap-2">
        {(['NinjaOne', 'Hudu', 'SharePoint', 'Fathom'] as const).map((tool) => (
          <span
            key={tool}
            className="grid h-12 place-items-center rounded-lg ring-1 ring-grey-2"
          >
            <ToolMark name={tool} className="text-[0.75rem]" />
          </span>
        ))}
      </div>
      <p className="mt-3 flex items-center justify-between rounded-lg bg-grey-1 px-3 py-2 text-[0.6875rem]">
        612 records read today
        <Tag tone="healthy" className="h-5 text-[0.625rem]">
          Read-only
        </Tag>
      </p>
    </div>
  );
}

export function UnderstandCard() {
  return (
    <div aria-hidden className="rounded-xl bg-white p-3">
      <p className="flex items-center gap-1.5 text-[0.625rem] text-muted">
        <Mark height={10} className="text-ink" />
        Dossier
      </p>
      <p className="mt-1 text-small">
        Harbour Dental needs two backups{' '}
        <span className="whitespace-nowrap">
          fixed <Cite n={1} />
        </span>{' '}
        and the domain{' '}
        <span className="whitespace-nowrap">
          renewed <Cite n={2} />.
        </span>
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        <Row
          title="Backups failing"
          detail="NinjaOne · 2 Nov"
          tag={{ tone: 'attention', label: 'Attention' }}
          tool="NinjaOne"
        />
        <Row
          title="Domain in 12 days"
          detail="Hudu · 31 Oct"
          tag={{ tone: 'act', label: '12 days' }}
          tool="Hudu"
        />
      </ul>
    </div>
  );
}

export function ActCard() {
  return (
    <div aria-hidden className="rounded-xl bg-white p-3">
      <div className="rounded-lg bg-lilac-soft p-3">
        <p className="flex items-center gap-1.5 text-[0.625rem] text-lilac-ink">
          <Mark height={10} />
          Drafted by Dossier
        </p>
        <p className="mt-1 text-[0.8125rem]">
          Send Sarah the firewall quote before Friday.
        </p>
        <div className="mt-2.5 flex gap-1.5">
          <span className="rounded-full bg-ink px-3 py-1 text-[0.6875rem] text-paper">
            Accept
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-[0.6875rem] ring-1 ring-stone">
            Edit
          </span>
        </div>
      </div>
      <p className="mt-2 rounded-lg bg-grey-1 px-3 py-2 text-[0.6875rem] text-muted">
        Logged to the audit log · 09:41
      </p>
    </div>
  );
}
