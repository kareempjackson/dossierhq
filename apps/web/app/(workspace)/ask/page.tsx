import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AskHistory } from '@/components/ask/ask-history';
import { Composer, ComposerFromUrl } from '@/components/ask/composer';
import { TopBar } from '@/components/shell/top-bar';
import { getWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Ask Dossier' };

const COMPOSER = {
  placeholder: 'Ask about a client, a device or something across all of them',
  suggestions: [
    'Which clients still run Windows 10?',
    'What expires this month?',
  ],
  suggestionsInside: true,
};

export default function AskPage() {
  const workspace = getWorkspace();
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
          <AskHistory asks={workspace.asks} />
        </div>
      </div>
    </>
  );
}
