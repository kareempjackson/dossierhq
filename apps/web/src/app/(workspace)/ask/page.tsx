import type { AskSummary } from '@dossierhq/contracts';
import { Suspense } from 'react';
import { AskBox } from '@/components/ui/ask-box';
import { ListCard, ListCardRow } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { SegmentedFilter } from '@/components/ui/segmented-filter';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { getAskHistory, getIntelligence, getWorkspace } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { formatList, formatTimestamp } from '@/lib/format';
import { askUnavailable } from '@/lib/intelligence';

export const metadata = { title: 'Ask Dossier' };

/** How many questions the list shows. */
const SHOWN = 50;

export default function AskPage({ searchParams }: PageProps<'/ask'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-220 flex-col gap-8">
        <header>
          <h1 className="text-title-compact sm:text-title">Ask Dossier</h1>
          <p className="mt-3 max-w-2xl text-text">
            Questions anyone here has asked, and Dossier’s answers. Each answer
            cites the records it rests on, as they stood when it was written, so
            a link to one can be shared.
          </p>
        </header>
        <Suspense fallback={<AskBox />}>
          <Box />
        </Suspense>
        <Suspense fallback={<HistorySkeleton />}>
          <History searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function Box() {
  const settings = await getIntelligence().catch(orNull);
  return <AskBox unavailable={settings && askUnavailable(settings)} />;
}

async function History({
  searchParams,
}: Pick<PageProps<'/ask'>, 'searchParams'>) {
  const mine = (await searchParams).mine === 'true';
  const [asked, workspace] = await Promise.all([
    getAskHistory({ mine, limit: SHOWN }).catch(orNull),
    getWorkspace(),
  ]);

  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="history-heading" className="text-section font-semibold">
          {mine ? 'Your questions' : 'Asked here'}
        </h2>
        <SegmentedFilter
          label="Whose questions"
          value={mine ? 'mine' : 'everyone'}
          options={[
            { value: 'everyone', label: 'Everyone', href: '/ask' },
            { value: 'mine', label: 'Mine', href: '/ask?mine=true' },
          ]}
        />
      </div>
      {asked === null ? (
        <ErrorState what="questions" />
      ) : asked.length === 0 ? (
        <EmptyState
          title={
            mine ? 'You haven’t asked anything yet.' : 'Nothing asked yet.'
          }
        >
          Ask about a client, a device or something across all of them, such as
          “Which clients still run Windows 10?”
        </EmptyState>
      ) : (
        <>
          <ListCard>
            {asked.map((question) => (
              <Question
                key={question.id}
                question={question}
                timeZone={workspace.timeZone}
              />
            ))}
          </ListCard>
          {asked.length === SHOWN && (
            <p className="text-meta text-muted">
              The latest {SHOWN} questions.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Question({
  question,
  timeZone,
}: {
  question: AskSummary;
  timeZone: string;
}) {
  const state =
    question.status === 'answering'
      ? 'Answering…'
      : question.status === 'failed'
        ? 'Couldn’t answer'
        : question.answered === false
          ? 'Not in the records'
          : null;
  return (
    <ListCardRow
      href={`/ask/${encodeURIComponent(question.id)}`}
      className="flex-col gap-1 px-5"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-medium text-ink">{question.question}</span>
        {state && <Pill tone="quiet">{state}</Pill>}
      </span>
      <span className="text-meta text-muted">
        {question.askedBy.name}, {formatTimestamp(question.askedAt, timeZone)}
        {question.clients.length > 0 &&
          ` · ${formatList(question.clients.map((c) => c.name))}`}
      </span>
    </ListCardRow>
  );
}

function HistorySkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <LoadingLabel what="questions" />
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-col gap-4 rounded-card bg-sheet p-5 shadow-card">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </section>
  );
}
