import { TOOL_NAMES, type Tool } from '@dossierhq/contracts';
import { Check } from 'lucide-react';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  AttentionVignette,
  AuditVignette,
  ExpiryVignette,
  FollowUpVignette,
  MergeVignette,
  SourceVignette,
} from '@/components/landing/feature-vignettes';
import { HeroVisual } from '@/components/landing/hero-visual';
import { ButtonLink } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { cn } from '@/lib/cn';

export const metadata: Metadata = {
  title: { absolute: 'Dossier · What needs attention at every client' },
};

export const viewport: Viewport = { themeColor: '#04130e' };

const TOOLS: Tool[] = ['ninjaone', 'hudu', 'sharepoint', 'fathom'];

const HERO_CHECKS = [
  'Read-only access',
  'Encrypted credentials',
  'Every read logged',
];

const FEATURES: { title: string; body: string; Still: ComponentType }[] = [
  {
    title: 'Needs attention',
    body: 'Active alerts, servers offline for 30 minutes or more and failed patching, most urgent first.',
    Still: AttentionVignette,
  },
  {
    title: 'About to expire',
    body: 'Certificates, domains, warranties and anything else in Hudu due in the next 30 days.',
    Still: ExpiryVignette,
  },
  {
    title: 'Follow-ups you promised',
    body: 'Action items from client meetings in Fathom, raised when they’re still open two weeks on.',
    Still: FollowUpVignette,
  },
  {
    title: 'One client, every tool',
    body: 'The same client in NinjaOne and Hudu becomes one, with its SharePoint files and meetings attached.',
    Still: MergeVignette,
  },
  {
    title: 'The record behind every line',
    body: 'Each item carries the alert, asset or moment in a meeting it came from.',
    Still: SourceVignette,
  },
  {
    title: 'Every read on record',
    body: 'An audit log of what Dossier read, from which tool and for which client, kept for 90 days.',
    Still: AuditVignette,
  },
];

const PROMISES = [
  {
    title: 'Read-only by design',
    body: 'Dossier reads from your tools and never writes back.',
    points: [
      'Credentials that can only read',
      'A setup guide for each tool',
      'Nothing changes on your side',
    ],
  },
  {
    title: 'Credentials kept sealed',
    body: 'Checked with the tool first, then encrypted before they’re stored.',
    points: [
      'Verified before saving',
      'AES-256-GCM encryption',
      'Never shown again',
    ],
  },
  {
    title: 'Every read on record',
    body: 'See what was read, when, and for which client.',
    points: [
      'A 90-day audit log',
      'Failed syncs explained in plain words',
      'Each workspace kept apart',
    ],
  },
];

const STEPS = [
  {
    title: 'Create your workspace',
    body: 'Your email and a password, then a few minutes of setup: your company, your tools and two-factor sign-in.',
  },
  {
    title: 'Connect your tools',
    body: 'Start with NinjaOne or Hudu. Each form shows how to make credentials that can only read.',
  },
  {
    title: 'Work from one list',
    body: 'Dossier reads every 15 minutes and keeps what needs attention current.',
  },
];

const container = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8';

/**
 * What signed-out visitors see at `/` (proxy.ts serves this page there): what
 * Dossier does, why it can be trusted, and the way in.
 */
export default function WelcomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-full bg-sheet px-4 py-2 text-body text-ink shadow-float focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>

      <div className="relative isolate overflow-hidden bg-night">
        <NightBackdrop />

        <header
          className={cn(container, 'flex h-18 items-center justify-between')}
        >
          <div className="flex items-center gap-10">
            <Link
              href="/"
              className="rounded-row text-wordmark font-semibold text-white"
            >
              Dossier
            </Link>
            <nav
              aria-label="Sections"
              className="hidden items-center gap-7 text-body text-white/65 md:flex"
            >
              {[
                ['Features', '#features'],
                ['Security', '#security'],
                ['How it works', '#how-it-works'],
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="rounded-row transition-colors hover:text-white"
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="rounded-full px-3 py-2 text-body font-medium text-white/80 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <ButtonLink href="/sign-up">Create account</ButtonLink>
          </nav>
        </header>

        <main id="main">
          <section
            aria-labelledby="hero-heading"
            className={cn(
              container,
              'grid grid-cols-1 items-center gap-16 pt-14 pb-20 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:pt-24 lg:pb-24',
            )}
          >
            <div className="motion-safe:animate-rise">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-meta text-white/80 ring-1 ring-white/10">
                <span aria-hidden className="size-1.5 rounded-full bg-mint" />
                For managed service providers
              </p>
              <h1
                id="hero-heading"
                className="mt-6 text-title text-balance text-white sm:text-display"
              >
                What needs attention at every client,{' '}
                <span className="text-mint">and why.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lead text-white/70">
                Dossier reads from NinjaOne, Hudu, SharePoint and Fathom, and
                puts what needs attention at each client in one calm list, with
                the record behind every line.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <ButtonLink variant="primary" size="lg" href="/sign-up">
                  Create your workspace
                </ButtonLink>
                <ButtonLink variant="inverse" size="lg" href="/sign-in">
                  Sign in
                </ButtonLink>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-meta text-white/65">
                {HERO_CHECKS.map((check) => (
                  <li key={check} className="flex items-center gap-2">
                    <Check aria-hidden className="size-4 text-mint" />
                    {check}
                  </li>
                ))}
              </ul>
            </div>
            <HeroVisual className="motion-safe:animate-rise motion-safe:[animation-delay:160ms]" />
          </section>

          <section
            aria-labelledby="tools-heading"
            className="border-t border-white/10"
          >
            <div
              className={cn(
                container,
                'flex flex-col gap-6 py-10 lg:flex-row lg:items-center lg:justify-between',
              )}
            >
              <h2 id="tools-heading" className="text-meta text-white/55">
                Reads from the tools you already use
              </h2>
              <ul className="grid grid-cols-2 gap-x-10 gap-y-5 sm:grid-cols-4">
                {TOOLS.map((tool) => (
                  <li
                    key={tool}
                    className="flex items-center gap-3 text-section font-semibold text-white/85"
                  >
                    <ConnectorTile tool={tool} tone="dark" />
                    {TOOL_NAMES[tool]}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </main>
      </div>

      <section
        id="features"
        aria-labelledby="features-heading"
        className="scroll-mt-4 bg-sheet py-24 sm:py-32"
      >
        <div className={container}>
          <SectionIntro
            id="features-heading"
            eyebrow="Features"
            title="Everything that needs you, in one place."
            body="Dossier reads what your tools already know and turns it into a short list for each client, with the source beside every line."
          />
          <ul className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ title, body, Still }) => (
              <li
                key={title}
                className="flex flex-col rounded-card bg-surface-soft p-6 ring-1 ring-hairline"
              >
                <h3 className="text-section font-semibold">{title}</h3>
                <p className="mt-2 text-text">{body}</p>
                <div className="mt-6 pt-1 md:mt-auto">
                  <Still />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="security"
        aria-labelledby="security-heading"
        className="relative isolate scroll-mt-4 overflow-hidden bg-night py-24 sm:py-32"
      >
        <NightBackdrop quiet />
        <div className={container}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-meta font-medium text-mint">Security</p>
            <h2
              id="security-heading"
              className="mt-3 text-title text-balance text-white sm:text-headline"
            >
              Built to be trusted with your clients.
            </h2>
            <div
              aria-hidden
              className="mx-auto mt-7 h-px w-64 bg-linear-to-r from-transparent via-mint/60 to-transparent"
            />
            <p className="mt-7 text-lead text-white/65">
              Dossier only ever reads. It never changes a device, an asset or a
              file.
            </p>
          </div>
          <ul className="mt-16 grid gap-12 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/10">
            {PROMISES.map((promise) => (
              <li
                key={promise.title}
                className="md:px-8 md:first:pl-0 md:last:pr-0 lg:px-12"
              >
                <h3 className="text-figure text-white">{promise.title}</h3>
                <p className="mt-3 text-white/65">{promise.body}</p>
                <ul className="mt-6 divide-y divide-white/10 border-y border-white/10">
                  {promise.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-center gap-2.5 py-3 text-body text-white/85"
                    >
                      <Check
                        aria-hidden
                        className="size-4 shrink-0 text-mint"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="steps-heading"
        className={cn(container, 'scroll-mt-4 py-24 sm:py-32')}
      >
        <SectionIntro
          id="steps-heading"
          eyebrow="How it works"
          title="From sign-up to one clear list."
          centered
        />
        <ol className="relative mt-16 grid gap-12 md:grid-cols-3 md:gap-8 md:before:absolute md:before:top-5 md:before:right-[16.67%] md:before:left-[16.67%] md:before:h-px md:before:bg-border-strong/30 md:before:content-['']">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative text-center">
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-sheet font-mono text-mono text-ink shadow-card tabular-nums">
                {index + 1}
              </span>
              <h3 className="mt-6 text-figure">{step.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-text">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="cta-heading"
        className="relative isolate overflow-hidden bg-sheet"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(var(--color-border-strong)_1px,transparent_1px)] bg-size-[22px_22px] opacity-40 mask-[radial-gradient(ellipse_55%_65%_at_50%_50%,transparent_35%,var(--color-white)_80%)]"
        />
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:py-32">
          <h2
            id="cta-heading"
            className="text-title text-balance sm:text-headline"
          >
            See what needs attention today.
          </h2>
          <p className="mt-5 text-lead text-text">
            Create your workspace, connect a tool, and Dossier starts reading.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink variant="primary" size="lg" href="/sign-up">
              Create your workspace
            </ButtonLink>
            <ButtonLink size="lg" href="/sign-in">
              Sign in
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-border-strong/20">
        <div
          className={cn(
            container,
            'grid gap-10 py-14 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]',
          )}
        >
          <div>
            <Link
              href="/"
              className="rounded-row text-wordmark font-semibold text-ink"
            >
              Dossier
            </Link>
            <p className="mt-3 max-w-xs text-meta text-muted-on-ground">
              What needs attention at every client, and why. Built for managed
              service providers.
            </p>
          </div>
          <FooterLinks
            title="Product"
            links={[
              ['Features', '#features'],
              ['Security', '#security'],
              ['How it works', '#how-it-works'],
            ]}
          />
          <FooterLinks
            title="Account"
            links={[
              ['Sign in', '/sign-in'],
              ['Create account', '/sign-up'],
            ]}
          />
        </div>
        <div className="border-t border-border-strong/20">
          <p
            className={cn(container, 'py-6 text-meta-sm text-muted-on-ground')}
          >
            NinjaOne, Hudu, SharePoint and Fathom are trademarks of their
            owners. Dossier reads from them; it isn’t made by them.
          </p>
        </div>
      </footer>
    </>
  );
}

/** The dark bands' depth: a faint grid fading out, and soft brand glows. */
function NightBackdrop({ quiet = false }: { quiet?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {!quiet && (
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-white)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-white)_1px,transparent_1px)] bg-size-[72px_72px] opacity-[0.05] mask-[radial-gradient(ellipse_70%_60%_at_60%_0%,var(--color-white),transparent)]" />
      )}
      <div
        className={cn(
          'absolute rounded-full bg-brand blur-[140px]',
          quiet
            ? 'top-[-40%] left-1/2 size-160 -translate-x-1/2 opacity-25'
            : '-top-48 right-[-12%] size-176 opacity-30',
        )}
      />
      {!quiet && (
        <div className="absolute top-1/3 -left-48 size-136 rounded-full bg-brand-deep opacity-80 blur-[120px]" />
      )}
    </div>
  );
}

function SectionIntro({
  id,
  eyebrow,
  title,
  body,
  centered = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  centered?: boolean;
}) {
  return (
    <div className={cn('max-w-2xl', centered && 'mx-auto text-center')}>
      <p className="text-meta font-medium text-brand">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-title text-balance sm:text-headline">
        {title}
      </h2>
      {body && <p className="mt-5 text-lead text-text">{body}</p>}
    </div>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: [label: string, href: string][];
}) {
  return (
    <nav aria-label={title}>
      <h2 className="text-meta font-semibold text-ink">{title}</h2>
      <ul className="mt-4 flex flex-col gap-2.5">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link
              href={href}
              className="rounded-row text-meta text-muted-on-ground transition-colors hover:text-ink"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
