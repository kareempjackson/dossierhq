import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { IllustratedPanel } from '@/components/auth/statement-panel';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import glass from '@/public/illustrations/Illustration · 16-read-only-glass.png';
import { OpenSupportForm } from './open-support-form';

export const metadata: Metadata = {
  title: 'Support view',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
  robots: { index: false },
};

/**
 * Where Dossier Admin's one-time support link opens (`?token=`), and where a
 * support view lands once it has ended (`?ended=1`). Opening the view is a
 * button, not the page load, because link scanners open links too, and the
 * link works only once.
 */
export default function SupportPage({ searchParams }: PageProps<'/support'>) {
  return (
    <AuthShell
      panel={
        <IllustratedPanel
          tone="lilac"
          title={
            <>
              Look, don’t touch.
              <br />
              Every view is logged.
            </>
          }
          body="Support views are read-only, last an hour at most, and show up in the workspace’s own audit log."
          illustration={glass}
          illustrationClassName="top-[63%] left-1/2 w-[min(96%,85vh)] -translate-x-1/2 -translate-y-1/2"
        />
      }
    >
      <Reveal fallback={<IndexLoader className="h-60" />}>
        <Support searchParams={searchParams} />
      </Reveal>
    </AuthShell>
  );
}

async function Support({
  searchParams,
}: Pick<PageProps<'/support'>, 'searchParams'>) {
  const { token: raw, ended } = await searchParams;
  const token = typeof raw === 'string' ? raw : '';

  if (ended === '1' && !token) {
    return (
      <>
        <h1 className="text-h1">The support view has ended.</h1>
        <p className="mt-2 text-muted">
          Its time ran out, or it was ended. You can close this tab, or open a
          new view from Dossier Admin.
        </p>
      </>
    );
  }
  if (!token) {
    return (
      <>
        <h1 className="text-h1">This support link is incomplete.</h1>
        <p className="mt-2 text-muted">
          Open a new support view from Dossier Admin.
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-h1">Open the support view.</h1>
      <p className="mt-2 text-muted">
        You’ll see this workspace as its owner does, read-only, until the view
        ends. Opening it is recorded in the workspace’s audit log.
      </p>
      <OpenSupportForm token={token} />
    </>
  );
}
