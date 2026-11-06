import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmailStart } from '@/components/marketing/email-start';
import { FolderDrawer } from '@/components/marketing/folder-drawer';
import { ToolMark } from '@/components/marketing/tool-mark';
import {
  ActCard,
  CiteScene,
  ConnectScene,
  MorningScene,
  ReadCard,
  ReportScene,
  Stage,
  UnderstandCard,
} from '@/components/marketing/visuals';
import { ButtonLink } from '@/components/ui/button';
import { CONTAINER } from '@/components/marketing/container';
import { cn } from '@/lib/cn';
import cabinet from '@/public/illustrations/10-original-cabinet 1.png';
import today from '@/public/images/product-today.png';

export const metadata: Metadata = {
  title: { absolute: 'Dossier · One file per client' },
  description:
    'Dossier reads NinjaOne, Hudu, SharePoint and Fathom, then keeps one cited file for every client you manage. Read-only, always.',
};

/** The public landing page. */
export default function WelcomePage() {
  return (
    <>
      <Hero />
      <ToolStrip />
      <div className={cn(CONTAINER, 'flex flex-col gap-24 py-24 lg:gap-32')}>
        <Feature
          id="connect"
          kicker="01 — Connect"
          title={
            <>
              Every tool,
              <br />
              read into one file.
            </>
          }
          body="Point Dossier at the tools you already pay for. It reads devices, documents, meetings and tickets, and files each record under the right client."
          points={[
            ['Read-only keys', 'for NinjaOne, Hudu, SharePoint and Fathom'],
            ['First sync', 'in about five minutes'],
            ['Audit log', 'of every single read'],
          ]}
          action={['Explore connections', '/connections']}
          scene={<ConnectScene />}
        />
        <Feature
          id="morning"
          flip
          kicker="02 — Morning"
          title={
            <>
              Wake up to
              <br />
              what needs you.
            </>
          }
          body="Before your first coffee, Dossier has read every client and set aside the few things that need a person: failing backups, renewals, promises."
          points={[
            ['Needs attention', 'ranked across every client'],
            ['Renewals', '30 days ahead'],
            ['Drafts', 'ready to send or edit'],
          ]}
          action={['See a morning in Dossier', '/']}
          scene={<MorningScene />}
        />
        <Feature
          id="cite"
          kicker="03 — Cite"
          title={
            <>
              Every line,
              <br />
              traced to its record.
            </>
          }
          body="Ask about one client or all of them. Every answer and every alert shows the records it rests on, one click from the source."
          points={[
            ['Ask Dossier', 'in plain English'],
            ['Sources', 'on every line'],
            ['Open record', 'in the tool it came from'],
          ]}
          action={['Explore Ask Dossier', '/ask']}
          scene={<CiteScene />}
        />
        <Feature
          id="report"
          flip
          kicker="04 — Report"
          title={
            <>
              Reports that write
              <br />
              themselves.
            </>
          }
          body="A weekly report for every client from the questions you choose. Nothing goes out until someone on your team approves it."
          points={[
            ['Approve', 'edit or regenerate'],
            ['Brand', 'with your logo and colour'],
            ['Schedule', 'drafts Monday, sends when ready'],
          ]}
          action={['Explore weekly reports', '/reports']}
          scene={<ReportScene />}
        />
      </div>
      <HowItWorks />
      <Folders />
      {/* "06 — In practice" (components/marketing/testimonials.tsx) is off
          while its quotes are placeholders. Bring it back with real
          customers' words, used with their permission. */}
      <Closing />
    </>
  );
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className={cn(CONTAINER, 'pt-16 sm:pt-24')}
    >
      <div className="mx-auto max-w-3xl text-center">
        <h1
          id="hero-title"
          className="text-[2.75rem] leading-[1.02] font-light tracking-[-0.04em] sm:text-[4.5rem]"
        >
          Know every client
          <br />
          before they call.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-muted">
          Dossier reads NinjaOne, Hudu, SharePoint and Fathom, then keeps one
          cited file for every client you manage. Read-only, always.
        </p>
        <EmailStart withMark className="mx-auto mt-8 max-w-lg justify-center" />
      </div>

      <div className="relative mt-14 overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_90%_at_0%_0%,var(--color-lilac)_0%,transparent_55%),radial-gradient(90%_80%_at_100%_0%,var(--color-lime)_0%,transparent_60%),linear-gradient(160deg,var(--color-lilac-soft)_30%,var(--color-lime-soft)_55%,color-mix(in_oklab,var(--color-stone-deep)_70%,var(--color-lime-soft))_100%)] px-4 pt-8 sm:px-14 sm:pt-12">
        <div className="mx-auto max-w-4xl translate-y-2 overflow-hidden rounded-t-2xl xl:max-w-5xl 2xl:max-w-6xl bg-white p-1.5 pb-0 shadow-[0_30px_80px_-30px_rgb(19_35_42/0.45)]">
          <Image
            src={today}
            alt="Dossier’s Today page: three clients need attention, with failing backups, a domain about to expire and a promised quote, each citing its source."
            sizes="(min-width: 1024px) 56rem, 100vw"
            loading="eager"
            fetchPriority="high"
            className="h-auto w-full rounded-t-xl"
          />
        </div>
      </div>
    </section>
  );
}

function ToolStrip() {
  return (
    <section
      aria-label="Tools Dossier reads"
      className={cn(CONTAINER, 'pt-16')}
    >
      <p className="text-center font-mono text-[0.6875rem] tracking-[0.12em] text-muted">
        READS THE TOOLS MSPS ALREADY RUN ON
      </p>
      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-muted">
        {(
          ['NinjaOne', 'Hudu', 'Fathom', 'SharePoint', 'Microsoft 365'] as const
        ).map((tool) => (
          <li key={tool}>
            <ToolMark name={tool} className="text-[1.375rem]" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Feature({
  id,
  kicker,
  title,
  body,
  points,
  action,
  scene,
  flip = false,
}: {
  id: string;
  kicker: string;
  title: ReactNode;
  body: string;
  points: [string, string][];
  action: [string, string];
  scene: ReactNode;
  flip?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-8 grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24"
    >
      <Stage className={cn(flip && 'lg:order-2')}>{scene}</Stage>
      <div className={cn('max-w-md', flip && 'lg:order-1')}>
        <p className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted">
          {kicker.toUpperCase()}
        </p>
        <h2 id={`${id}-title`} className="mt-3 text-h1">
          {title}
        </h2>
        <p className="mt-4 text-muted">{body}</p>
        <ul className="mt-6 flex flex-col gap-2 text-small">
          {points.map(([lead, rest]) => (
            <li key={lead}>
              <span className="underline decoration-ink/30 underline-offset-[3px]">
                {lead}
              </span>{' '}
              {rest}
            </li>
          ))}
        </ul>
        <ButtonLink href={action[1]} variant="outline" className="mt-8">
          {action[0]}
        </ButtonLink>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      name: 'Read',
      tone: 'bg-lime',
      card: <ReadCard />,
      body: 'Read-only keys for NinjaOne, Hudu, SharePoint and Fathom. Every record filed under the right client.',
    },
    {
      n: '02',
      name: 'Understand',
      tone: 'bg-lilac',
      card: <UnderstandCard />,
      body: 'Dossier ranks what needs a person and answers questions, citing the records behind every line.',
    },
    {
      n: '03',
      name: 'Act',
      tone: 'bg-stone',
      card: <ActCard />,
      body: 'Approve a draft, send a report, or open the record in the tool it came from.',
    },
  ];
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className={cn(CONTAINER, 'scroll-mt-8')}
    >
      <div className="rounded-[2rem] bg-grey-1 px-4 py-16 sm:px-10 xl:px-14">
        <p className="text-center font-mono text-[0.6875rem] tracking-[0.12em] text-muted">
          HOW IT WORKS
        </p>
        <h2 id="how-title" className="mt-3 text-center text-h1 sm:text-[3rem]">
          One file. Three habits.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-center text-small text-muted">
          Dossier reads your tools, understands what matters, and helps you act.
          Every step is written to the file’s audit log.
        </p>
        <ol className="mt-12 grid gap-6 lg:grid-cols-3">
          {steps.map((step) => (
            <li key={step.name}>
              <span
                className={cn(
                  'flex h-9 w-40 items-start rounded-t-xl px-4 pt-2 text-small',
                  step.tone,
                )}
              >
                <span className="mr-2 font-mono text-[0.75rem]">{step.n}</span>
                {step.name}
              </span>
              <div
                className={cn(
                  'flex h-[calc(100%-2.25rem)] flex-col rounded-2xl rounded-tl-none p-3',
                  step.tone,
                )}
              >
                {step.card}
                <p className="mt-auto px-2 pt-6 pb-2 text-small">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-center text-[0.75rem] text-muted">
          Every action is logged back to the file, so the next read is smarter.
        </p>
      </div>
    </section>
  );
}

function Folders() {
  return (
    <section
      id="folder"
      aria-labelledby="folder-title"
      className="mt-24 scroll-mt-8 overflow-hidden bg-deep text-paper"
    >
      <div className={cn(CONTAINER, 'pt-20')}>
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="font-mono text-[0.6875rem] tracking-[0.1em] text-paper/60">
              05 — THE FOLDER
            </p>
            <h2
              id="folder-title"
              className="mt-3 text-[3rem] leading-none font-light tracking-[-0.04em] sm:text-[4.5rem]"
            >
              Filed,
              <br />
              not buried.
            </h2>
            <p className="mt-6 flex items-center gap-2 text-[0.75rem] text-paper/60">
              <span aria-hidden className="size-1.5 rounded-full bg-paper/60" />
              Point at a tab to pull its records
            </p>
          </div>
          <div className="max-w-sm lg:justify-self-end">
            <p className="text-small text-paper/70">
              Every client gets one folder. Clients, devices, reports, meetings
              and notes are tabs inside it. Open a tab and the records come out,
              each one cited back to the tool it came from.
            </p>
            <ButtonLink
              href="/clients/harbour-dental"
              variant="act"
              className="mt-6"
            >
              Open a sample file
            </ButtonLink>
          </div>
        </div>
      </div>
      <div className={cn(CONTAINER, 'mt-16')}>
        <FolderDrawer />
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section aria-labelledby="closing-title" className={cn(CONTAINER, 'pb-24')}>
      <div className="relative grid items-center gap-8 overflow-hidden rounded-[2rem] bg-lime px-6 py-12 sm:px-12 xl:px-16 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <h2
            id="closing-title"
            className="text-h1 sm:text-[3rem] sm:leading-[1.05]"
          >
            It’s time every client
            <br />
            had a file.
          </h2>
          <p className="mt-3 text-small">
            Set up in five minutes. Read-only from day one.
          </p>
          <EmailStart variant="ink" className="mt-10 max-w-md" />
          <p className="mt-3 text-[0.75rem]">
            Already have an account?{' '}
            <Link href="/sign-in" className="underline underline-offset-[3px]">
              Log in
            </Link>
          </p>
        </div>
        <Image
          src={cabinet}
          alt=""
          sizes="22rem"
          className="mx-auto h-auto w-72 lg:w-full"
        />
      </div>
    </section>
  );
}
