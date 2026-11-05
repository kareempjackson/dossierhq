import {
  hasRole,
  INTELLIGENCE_MODELS,
  type AskAnswer,
  type WritingStyle,
} from '@dossierhq/contracts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AnswerActions } from '@/components/ask/answer-actions';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { CopyForClient } from '@/components/ui/executive-brief';
import { RefreshWhile } from '@/components/ui/refresh-while-syncing';
import { Sheet } from '@/components/ui/sheet';
import { SourceChip } from '@/components/ui/source-chip';
import { SourceList } from '@/components/ui/source-list';
import { Skeleton } from '@/components/ui/states';
import { Styled, StyleSwitch } from '@/components/ui/style-switch';
import { getAskAnswer, getMe, getWorkspace } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { formatDollars, formatTimestamp } from '@/lib/format';
import { sourceName } from '@/lib/sources';
import { readingStyle } from '@/lib/writing-style';

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
  const [workspace, me, style] = await Promise.all([
    getWorkspace(),
    getMe(),
    readingStyle(),
  ]);
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
        <Written answer={answer} timeZone={workspace.timeZone} style={style} />
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
  style,
}: {
  answer: AskAnswer;
  timeZone: string;
  style: WritingStyle;
}) {
  // Numbered in the order the answer first cites them, the technical
  // version first; both versions rest on the same records.
  const byId = new Map(answer.sources.map((s) => [s.id, s]));
  const sources = [
    ...new Set(
      [...answer.lines, ...answer.executiveLines].flatMap(
        (line) => line.sourceIds,
      ),
    ),
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <StyleSwitch initial={style} />
        {/* About one client, its leadership may be sent it. */}
        {answer.clients.length === 1 && answer.executiveLines.length > 0 && (
          <Styled
            initial={style}
            technical={null}
            executive={
              <CopyForClient
                text={answer.executiveLines.map((l) => l.text).join('\n\n')}
              />
            }
          />
        )}
      </div>
      <Styled
        initial={style}
        technical={
          <Paragraphs lines={answer.lines} number={number} byId={byId} />
        }
        executive={
          answer.executiveLines.length > 0 ? (
            <Paragraphs
              lines={answer.executiveLines}
              number={number}
              byId={byId}
            />
          ) : (
            <p className="text-meta text-muted">
              This answer has no executive version. Ask again to get one.
            </p>
          )
        }
      />

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

/** An answer's paragraphs, each with numbered chips for what it cites. */
function Paragraphs({
  lines,
  number,
  byId,
}: {
  lines: AskAnswer['lines'];
  number: Map<string, number>;
  byId: Map<string, AskAnswer['sources'][number]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, index) => (
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
