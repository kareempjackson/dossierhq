import { TOOL_NAMES, type Tool } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AttentionPreview } from '@/components/landing/attention-preview';
import { ButtonLink } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';

export const metadata: Metadata = {
  title: { absolute: 'Dossier · What needs attention at every client' },
};

const STEPS = [
  {
    title: 'Create your workspace',
    body: 'Your company’s name, your own and your time zone. It takes about a minute.',
  },
  {
    title: 'Connect your tools',
    body: 'Start with NinjaOne or Hudu. Each form shows how to make credentials that can only read.',
  },
  {
    title: 'See what needs attention',
    body: 'Alerts, offline servers, failed patching, anything about to expire, and follow-ups still open after a meeting.',
  },
];

const TOOLS: { tool: Tool; reads: string }[] = [
  {
    tool: 'ninjaone',
    reads:
      'Organisations become clients, with their devices, patch status and active alerts.',
  },
  {
    tool: 'hudu',
    reads:
      'Companies, assets, websites and anything about to expire. Never passwords.',
  },
  {
    tool: 'sharepoint',
    reads: 'The files in each client’s folder, matched to the client by name.',
  },
  {
    tool: 'fathom',
    reads:
      'Client meetings from the last 90 days, and the action items you took on.',
  },
];

const PROMISES = [
  {
    title: 'Read-only, always',
    body: 'Dossier never changes anything in your tools. Each connection uses credentials that can only read.',
  },
  {
    title: 'Credentials stay sealed',
    body: 'Checked with the tool first, encrypted before they’re stored, and never shown again.',
  },
  {
    title: 'Every read is logged',
    body: 'The audit log shows what Dossier read, from which tool and for which client, for 90 days.',
  },
  {
    title: 'Your workspace is yours',
    body: 'Each company’s clients, connections and records are kept apart from everyone else’s.',
  },
];

/**
 * What signed-out visitors see at `/` (proxy.ts serves this page there): what
 * Dossier does, and the way in.
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

      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-row text-wordmark font-semibold text-ink"
        >
          Dossier
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
          <ButtonLink variant="ghost" href="/sign-in">
            Sign in
          </ButtonLink>
          <ButtonLink href="/sign-up">Create account</ButtonLink>
        </nav>
      </header>

      <main id="main">
        <section
          aria-labelledby="hero-heading"
          className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pt-10 pb-20 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:pt-20 lg:pb-28"
        >
          <div>
            <p className="text-meta font-medium text-brand-deep">
              For managed service providers
            </p>
            <h1 id="hero-heading" className="mt-4 text-title sm:text-display">
              What needs attention at every client, and why.
            </h1>
            <p className="mt-5 max-w-xl text-lead text-text">
              Dossier reads from NinjaOne, Hudu, SharePoint and Fathom, and puts
              what needs attention at each client in one list, with the record
              behind every line.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <ButtonLink
                variant="primary"
                href="/sign-up"
                className="h-11 px-5 text-section"
              >
                Create your workspace
              </ButtonLink>
              <p className="text-meta text-muted-on-ground">
                Connect your tools when you’re ready.
              </p>
            </div>
          </div>
          <AttentionPreview />
        </section>

        <section
          aria-labelledby="steps-heading"
          className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28"
        >
          <SectionIntro
            id="steps-heading"
            eyebrow="How it works"
            title="From sign-up to a clear list in three steps."
          />
          <ol className="mt-8 grid gap-2 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="rounded-card bg-sheet p-6 shadow-card"
              >
                <span className="font-mono text-mono text-muted tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-6 text-figure">{step.title}</h3>
                <p className="mt-2 text-text">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="tools-heading"
          className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28"
        >
          <SectionIntro
            id="tools-heading"
            eyebrow="Works with"
            title="The tools you already use."
            body="Connect one or all four. Clients found in more than one tool come together as one client."
          />
          <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map(({ tool, reads }) => (
              <li key={tool} className="rounded-card bg-sheet p-5 shadow-card">
                <div className="flex items-center gap-3">
                  <ConnectorTile tool={tool} />
                  <h3 className="text-section font-semibold">
                    {TOOL_NAMES[tool]}
                  </h3>
                </div>
                <p className="mt-4 text-meta text-text">{reads}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="promises-heading"
          className="mx-auto max-w-6xl px-2 sm:px-6"
        >
          <div className="grid gap-12 rounded-card bg-brand-deep px-6 py-12 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:px-14 lg:py-16">
            <div>
              <p className="text-meta font-medium text-white/70">
                It only ever reads
              </p>
              <h2
                id="promises-heading"
                className="mt-3 text-title-compact text-white sm:text-title"
              >
                Your tools stay exactly as they are.
              </h2>
              <p className="mt-4 max-w-md text-white/75">
                Dossier reads, notes every read, and shows you what it found.
                Nothing it does reaches back into your tools.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                <ButtonLink href="/sign-up" className="h-11 px-5 text-section">
                  Create your workspace
                </ButtonLink>
                <Link
                  href="/sign-in"
                  className="rounded-row text-body font-medium text-white underline decoration-white/40 underline-offset-2 transition-colors hover:decoration-white"
                >
                  Sign in
                </Link>
              </div>
            </div>
            <ul className="grid content-start gap-x-10 gap-y-8 sm:grid-cols-2">
              {PROMISES.map((promise) => (
                <li
                  key={promise.title}
                  className="border-t border-white/15 pt-4"
                >
                  <h3 className="text-section font-semibold text-white">
                    {promise.title}
                  </h3>
                  <p className="mt-1.5 text-white/75">{promise.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-8 text-meta text-muted-on-ground sm:px-6">
        <p>
          <span className="font-semibold text-ink">Dossier</span> · What needs
          attention at every client, and why.
        </p>
        <p className="flex gap-4">
          <Link href="/sign-in" className="rounded-row hover:text-ink">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-row hover:text-ink">
            Create account
          </Link>
        </p>
      </footer>
    </>
  );
}

function SectionIntro({
  id,
  eyebrow,
  title,
  body,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-meta font-medium text-brand-deep">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-title-compact sm:text-title">
        {title}
      </h2>
      {body && <p className="mt-4 text-lead text-text">{body}</p>}
    </div>
  );
}
