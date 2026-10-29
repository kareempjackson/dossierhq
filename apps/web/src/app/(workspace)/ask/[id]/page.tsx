import {
  hasRole,
  INTELLIGENCE_MODELS,
  type AskAnswer,
} from '@dossierhq/contracts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AnswerActions } from '@/components/ask/answer-actions';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { RefreshWhile } from '@/components/ui/refresh-while-syncing';
import { Sheet } from '@/components/ui/sheet';
import { SourceChip } from '@/components/ui/source-chip';
import { SourceList } from '@/components/ui/source-list';
import { Skeleton } from '@/components/ui/states';
import { getAskAnswer, getMe, getWorkspace } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { formatDollars, formatTimestamp } from '@/lib/format';
import { sourceName } from '@/lib/sources';

export async function generateMetadata({ params }: PageProps<'/ask/[id]'>) {
  const answer = await getAskAnswer((await params).id).catch(orNull);
  return { title: answer?.question ?? 'Ask Dossier' };
}

export default function AnswerPage({ params }: PageProps<'/ask/[id]'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-180 flex-col gap-8">
        <Suspense fallback={<AnswerSkeleton />}>
          <Answer params={params} />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function Answer({ params }: Pick<PageProps<'/ask/[id]'>, 'params'>) {
  const answer = await getAskAnswer((await params).id);
  if (!answer) notFound();
  const [workspace, me] = await Promise.all([getWorkspace(), getMe()]);
  const canDelete =
    answer.askedBy.userId === me.user.id || hasRole(me.role, 'admin');

  return (
    <>
      <header>
        <Breadcrumb
          items={[{ label: 'Ask Dossier', href: '/ask' }, { label: 'Answer' }]}
        />
        <h1 className="mt-3 text-title-compact text-balance sm:text-title">
          {answer.question}
        </h1>
        <p className="mt-2 text-meta text-muted">
          Asked by {answer.askedBy.name},{' '}
          {formatTimestamp(answer.askedAt, workspace.timeZone)}
        </p>
      </header>

      {answer.status === 'answering' ? (
        <Answering answer={answer} />
      ) : answer.status === 'failed' ? (
        <section className="rounded-card bg-alert-soft p-5">
          <h2 className="font-medium text-ink">Dossier couldn’t answer this</h2>
          <p className="mt-1 text-meta text-text">
            {answer.error ?? 'Something went wrong. Try asking again.'}
          </p>
        </section>
      ) : (
        <Written answer={answer} timeZone={workspace.timeZone} />
      )}

      {answer.status !== 'answering' && (
        <AnswerActions
          id={answer.id}
          question={answer.question}
          canDelete={canDelete}
        />
      )}
    </>
  );
}

/** While Dossier reads: whose records, and a page that keeps looking. */
function Answering({ answer }: { answer: AskAnswer }) {
  const reading = answer.clients.at(-1)?.name;
  return (
    <section
      aria-labelledby="answering-heading"
      className="rounded-card bg-sheet p-5 shadow-card"
    >
      <h2 id="answering-heading" className="sr-only">
        Answer
      </h2>
      <RefreshWhile
        active
        everyMs={2000}
        status={
          reading
            ? `Reading ${reading}’s records…`
            : 'Looking through your clients’ records…'
        }
        className="font-medium text-ink"
      />
      <p className="mt-1 text-meta text-muted">
        Answers usually take under a minute. You can leave this page; the answer
        will be here when you come back.
      </p>
      <div className="mt-5 flex flex-col gap-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </section>
  );
}

function Written({
  answer,
  timeZone,
}: {
  answer: AskAnswer;
  timeZone: string;
}) {
  // Numbered in the order the answer first cites them.
  const byId = new Map(answer.sources.map((s) => [s.id, s]));
  const sources = [
    ...new Set(answer.lines.flatMap((line) => line.sourceIds)),
  ].flatMap((id) => byId.get(id) ?? []);
  const number = new Map(sources.map((s, index) => [s.id, index + 1]));
  const model =
    INTELLIGENCE_MODELS.find((m) => m.id === answer.model)?.name ??
    answer.model;

  return (
    <section
      aria-labelledby="answer-heading"
      className="rounded-card bg-sheet p-5 shadow-card sm:p-6"
    >
      <h2
        id="answer-heading"
        className={
          answer.answered ? 'sr-only' : 'mb-3 text-meta font-medium text-muted'
        }
      >
        {answer.answered ? 'Answer' : 'The records don’t answer this'}
      </h2>
      <div className="flex flex-col gap-3">
        {answer.lines.map((line, index) => (
          <p key={index} className="text-body text-ink">
            {line.text}
            {line.sourceIds.flatMap((id) => {
              const n = number.get(id);
              const source = byId.get(id);
              return n && source
                ? [
                    <SourceChip
                      key={id}
                      number={n}
                      label={sourceName(source)}
                      className="ml-1"
                    />,
                  ]
                : [];
            })}
          </p>
        ))}
      </div>

      {sources.length > 0 && (
        <div className="mt-5 rounded-tile bg-surface-soft p-3">
          <h3 className="text-meta-sm font-medium text-muted">
            What it rests on, as it stood{' '}
            {answer.finishedAt && formatTimestamp(answer.finishedAt, timeZone)}
          </h3>
          <SourceList sources={sources} timeZone={timeZone} className="mt-2" />
        </div>
      )}

      <p className="mt-4 text-meta text-muted">
        {answer.clients.length > 0 ? (
          <>
            Drew on{' '}
            {answer.clients.map((client, index) => (
              <span key={client.id}>
                {index > 0 &&
                  (index === answer.clients.length - 1 ? ' and ' : ', ')}
                <Link
                  href={`/clients/${encodeURIComponent(client.id)}`}
                  className="text-ink underline decoration-border-strong underline-offset-2 hover:decoration-ink"
                >
                  {client.name}
                </Link>
              </span>
            ))}
          </>
        ) : (
          'Drew on no client’s records'
        )}
        {model && ` · ${model}`}
        {answer.cost !== null && ` · ${formatDollars(answer.cost)}`}
      </p>
    </section>
  );
}

function AnswerSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="flex flex-col gap-2.5 rounded-card bg-sheet p-5 shadow-card">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}
