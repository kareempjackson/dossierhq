import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReviewPage } from '@/components/reports/review-page';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getWorkspace } from '@/lib/workspace';

const findDraft = (id: string) =>
  getWorkspace().weekly.drafts.find((draft) => draft.id === id);

/** This week's drafts are built ahead; Cache Components needs at least one. */
export function generateStaticParams() {
  const drafts = getWorkspace().weekly.drafts;
  return drafts.length > 0
    ? drafts.map((draft) => ({ id: draft.id }))
    : [{ id: '__none__' }];
}

export async function generateMetadata({
  params,
}: PageProps<'/reports/[id]'>): Promise<Metadata> {
  const draft = findDraft((await params).id);
  const name =
    draft &&
    getWorkspace().clients.find((client) => client.id === draft.clientId)?.name;
  return { title: name ? `Report · ${name}` : 'Reports' };
}

/** One draft under review; the URL names it, so it streams in behind a skeleton. */
export default function ReportPage({ params }: PageProps<'/reports/[id]'>) {
  return (
    <Reveal
      fallback={
        <IndexLoader className="h-[19rem]" label="Loading the report" />
      }
    >
      <Draft params={params} />
    </Reveal>
  );
}

async function Draft({ params }: Pick<PageProps<'/reports/[id]'>, 'params'>) {
  const draft = findDraft((await params).id);
  if (!draft) notFound();
  return <ReviewPage draft={draft} />;
}
