import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Composer } from '@/components/ask/composer';
import { Mark } from '@/components/brand/logo';
import { TopBar } from '@/components/shell/top-bar';
import { ButtonLink } from '@/components/ui/button';
import { CitedStack } from '@/components/ui/cited-stack';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getWorkspace } from '@/lib/workspace';

/** Every test question's answer is built ahead; Cache Components needs at least one. */
export function generateStaticParams() {
  const asks = getWorkspace().asks;
  return asks.length > 0
    ? asks.map((item) => ({ id: item.id }))
    : [{ id: '__none__' }];
}

export async function generateMetadata({
  params,
}: PageProps<'/ask/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const item = getWorkspace().asks.find((candidate) => candidate.id === id);
  return { title: item ? item.title : 'Ask Dossier' };
}

const SUGGESTIONS = [
  'What expires this month?',
  'Which backups are failing?',
  'Which clients need attention?',
];

/**
 * One question and its cited answer, with the files it rests on beside it.
 * The answer depends on the URL, so it sits in Suspense: navigating here
 * shows the page's frame at once, then the answer.
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
  const item = getWorkspace().asks.find((candidate) => candidate.id === id);
  if (!item) notFound();

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex flex-col lg:min-h-[calc(100dvh-11rem)]">
        <p className="ml-auto max-w-md rounded-2xl bg-grey-2 px-4 py-3 text-small">
          {item.question}
        </p>

        <article className="mt-8">
          <p className="flex items-center gap-2 text-small text-muted">
            <Mark height={12} className="text-ink" />
            Dossier
          </p>
          <h1 className="mt-3 text-h2">{item.answer.heading}</h1>
          <ul className="mt-4 flex flex-col gap-2">
            {item.answer.lines.map((line) => (
              <li key={line.cite}>
                <strong className="font-semibold">{line.label}</strong>:{' '}
                {line.text}
                <sup className="ml-1 font-mono text-[0.625rem] text-lilac-ink">
                  {line.cite}
                </sup>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            {item.answer.actions.map((action) => (
              <ButtonLink
                key={action.label}
                href={action.href}
                variant={action.variant}
              >
                {action.label}
              </ButtonLink>
            ))}
          </div>
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
        <CitedStack files={item.answer.cited} className="mt-1" />
      </aside>
    </div>
  );
}
