import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AskHistory } from '@/components/ask/ask-history';
import { Composer, ComposerFromUrl } from '@/components/ask/composer';
import { TopBar } from '@/components/shell/top-bar';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { askRows } from '@/lib/ask-views';
import { getAskHistory } from '@/lib/data/ask';
import { getMe } from '@/lib/data/auth';
import { orNull } from '@/lib/data/safe';

export const metadata: Metadata = { title: 'Ask Dossier' };

const COMPOSER = {
  placeholder: 'Ask about a client, a device or something across all of them',
  suggestions: [
    'Which clients still run Windows 10?',
    'What expires this month?',
  ],
  suggestionsInside: true,
};

/**
 * The Ask box, and every question asked here. The history reads the API
 * in its own Suspense, so the box is ready to type in at once.
 */
export default function AskPage() {
  return (
    <>
      <TopBar
        title="Ask Dossier"
        subtitle="Questions anyone here has asked, with the records each answer rests on"
      />
      <div className="mt-8">
        <Suspense fallback={<Composer {...COMPOSER} />}>
          <ComposerFromUrl {...COMPOSER} />
        </Suspense>
        <div className="mt-8">
          <Reveal
            fallback={
              <IndexLoader className="h-64" label="Loading the questions" />
            }
          >
            <History />
          </Reveal>
        </div>
      </div>
    </>
  );
}

async function History() {
  const [me, everyone, mine] = await Promise.all([
    getMe().catch(orNull),
    getAskHistory(false).catch(orNull),
    getAskHistory(true).catch(orNull),
  ]);
  if (!me || !everyone || !mine) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-grey-1 px-4 py-6 text-small text-muted"
      >
        Dossier couldn’t read the questions just now. Reload the page to try
        again.
      </p>
    );
  }
  const when = { timeZone: me.workspace.timeZone, now: new Date() };
  return (
    <AskHistory everyone={askRows(everyone, when)} mine={askRows(mine, when)} />
  );
}
