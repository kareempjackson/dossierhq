import { LoaderCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, unstable_rethrow } from 'next/navigation';
import { Composer } from '@/components/ask/composer';
import { Mark } from '@/components/brand/logo';
import { RefreshWhileSyncing } from '@/components/connections/refresh-while-syncing';
import { TopBar } from '@/components/shell/top-bar';
import { ButtonLink } from '@/components/ui/button';
import { CitedStack } from '@/components/ui/cited-stack';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { answerView, type AnswerLine } from '@/lib/ask-views';
import { getAnswer } from '@/lib/data/ask';
import { getMe } from '@/lib/data/auth';
import { orNull } from '@/lib/data/safe';

/**
 * Answers are per workspace and read at request time. Cache Components
 * needs one param to build the route's static shell, so a placeholder
 * stands in; no question has that id.
 */
export function generateStaticParams() {
  return [{ id: '__shell__' }];
}

export async function generateMetadata({
  params,
}: PageProps<'/ask/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const answer = await getAnswer(id).catch(orNull);
  if (!answer) return { title: 'Ask Dossier' };
  const { question } = answer;
  return {
    title: question.length > 60 ? `${question.slice(0, 59)}…` : question,
  };
}

const SUGGESTIONS = [
  'What expires this month?',
  'Which clients need attention?',
];

/**
 * One question and its cited answer, with the files it rests on beside it.
 * The answer depends on the URL, so it sits in Suspense: navigating here
 * shows the page's frame at once, then the answer. While Dossier is still
 * answering, the page asks again every few seconds.
 */
export default function AnswerPage({ params }: PageProps<'/ask/[id]'>) {
  return (
    <>
      <TopBar
        title="Ask Dossier"
        subtitle="Every answer cites the record it came from"
      />
      <Reveal
        fallback={
          <IndexLoader className="mt-8 h-72" label="Loading the answer" />
        }
      >
        <Answer params={params} />
      </Reveal>
    </>
  );
}

async function Answer({ params }: Pick<PageProps<'/ask/[id]'>, 'params'>) {
  const { id } = await params;
  const [me, answer] = await Promise.all([
    getMe().catch(orNull),
    getAnswer(id).catch((error: unknown) => {
      unstable_rethrow(error);
      return undefined;
    }),
  ]);
  if (answer === null) notFound();
  if (!answer || !me) {
    return (
      <p
        role="alert"
        className="mt-8 rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted"
      >
        Dossier couldn’t read this answer just now. Reload the page to try
        again.
      </p>
    );
  }
  const view = answerView(answer, {
    timeZone: me.workspace.timeZone,
    now: new Date(),
  });

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <RefreshWhileSyncing syncing={view.state === 'answering'} />
      <div className="flex flex-col lg:min-h-[calc(100dvh-11rem)]">
        <div className="ml-auto max-w-md">
          <p className="rounded-2xl bg-grey-2 px-4 py-3 text-small">
            {view.question}
          </p>
          <p className="mt-1.5 text-right text-[0.75rem] text-muted">
            {view.askedBy} ·{' '}
            <span title={view.askedAtFull}>{view.askedAt}</span>
          </p>
        </div>

        <article className="mt-8" aria-busy={view.state === 'answering'}>
          <p className="flex items-center gap-2 text-small text-muted">
            <Mark height={12} className="text-ink" />
            Dossier
          </p>

          {view.state === 'answering' ? (
            <p
              role="status"
              className="mt-3 flex items-center gap-2 text-body text-muted"
            >
              <LoaderCircle
                aria-hidden
                strokeWidth={1.75}
                className="size-4 motion-safe:animate-spin"
              />
              Reading the records. The answer appears here when it’s ready.
            </p>
          ) : view.state === 'failed' ? (
            <div role="alert" className="mt-3">
              <h1 className="text-h2">Dossier couldn’t answer this.</h1>
              <p className="mt-2 text-muted">
                {view.error ?? 'Something went wrong while it was reading.'} Try
                asking again below.
              </p>
            </div>
          ) : (
            <>
              {view.state === 'not-found' && (
                <h1 className="mt-3 text-h2">The records don’t show this.</h1>
              )}
              <Lines lines={view.lines} />
              {view.executive.length > 0 && (
                <section aria-labelledby="plain-words" className="mt-8">
                  <h2
                    id="plain-words"
                    className="font-sans text-small font-normal tracking-normal text-muted"
                  >
                    In plain words, for leadership
                  </h2>
                  <Lines lines={view.executive} />
                </section>
              )}
              {view.clients.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {view.clients.slice(0, 3).map((client, index) => (
                    <ButtonLink
                      key={client.id}
                      href={`/clients/${encodeURIComponent(client.id)}`}
                      variant={index === 0 ? 'ink' : 'outline'}
                    >
                      Open {client.name}
                    </ButtonLink>
                  ))}
                </div>
              )}
            </>
          )}
        </article>

        <div className="mt-auto pt-16">
          <Composer
            glow
            placeholder="Ask about any client, renewal or promise"
            suggestions={SUGGESTIONS}
          />
        </div>
      </div>

      <aside aria-labelledby="cited-files">
        <p id="cited-files" className="text-small text-muted">
          Cited files
        </p>
        {view.cited.length > 0 ? (
          <>
            {/* Three fit the column; the list below names every one. */}
            <CitedStack
              files={view.cited.slice(0, 3).reverse()}
              className="mt-1"
            />
            <ol className="mt-2 flex flex-col gap-1 text-[0.75rem]">
              {view.cited.map((file, index) => (
                <li key={file.id ?? index} className="flex gap-1.5">
                  <span className="font-mono text-lilac-ink">{index + 1}</span>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate underline decoration-ink/20 underline-offset-[3px] hover:decoration-ink"
                    title={`${file.title} · ${file.source}, ${file.date}`}
                  >
                    {file.title}
                  </a>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-1 text-[0.75rem] text-muted">
            {view.state === 'answering'
              ? 'The records it reads show here.'
              : 'No records cited.'}
          </p>
        )}
      </aside>
    </div>
  );
}

/** An answer's paragraphs, each with the numbers of the files it cites. */
function Lines({ lines }: { lines: AnswerLine[] }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {lines.map((line, index) => (
        <p key={index} className="whitespace-pre-line">
          {line.text}
          {line.cites.length > 0 && (
            <sup className="ml-1 font-mono text-[0.625rem] text-lilac-ink">
              {line.cites.join(' ')}
            </sup>
          )}
        </p>
      ))}
    </div>
  );
}
