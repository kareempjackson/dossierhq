import type { Report, Source } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { notFound, unstable_rethrow } from 'next/navigation';
import { ReadFailed } from '@/components/clients/client-tab';
import { ReportReview } from '@/components/reports/report-review';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getMe } from '@/lib/data/auth';
import { getReportSettings, getSources } from '@/lib/data/client-records';
import { getClientNames } from '@/lib/data/clients';
import { getReport, getReportDelivery } from '@/lib/data/reports';
import { orNull } from '@/lib/data/safe';
import { reviewView } from '@/lib/report-views';

/** Reports are read on request; Cache Components needs one param to build. */
export function generateStaticParams() {
  return [{ id: '__none__' }];
}

export async function generateMetadata({
  params,
}: PageProps<'/reports/[id]'>): Promise<Metadata> {
  const report = await getReport((await params).id).catch(orNull);
  const name =
    report && (await getClientNames().catch(orNull))?.get(report.clientId);
  return { title: name ? `Report · ${name}` : 'Reports' };
}

/** One report under review; the URL names it, so it streams in. */
export default function ReportPage({ params }: PageProps<'/reports/[id]'>) {
  return (
    <Reveal
      fallback={
        <IndexLoader className="h-[19rem]" label="Loading the report" />
      }
    >
      <Review params={params} />
    </Reveal>
  );
}

async function Review({ params }: Pick<PageProps<'/reports/[id]'>, 'params'>) {
  const { id } = await params;
  const report = await getReport(id).catch((error: unknown) => {
    unstable_rethrow(error);
    return undefined;
  });
  if (report === undefined) return <ReadFailed what="this report" />;
  if (report === null) notFound();
  const [me, delivery, settings, names, sources] = await Promise.all([
    getMe(),
    getReportDelivery(id).catch(orNull),
    getReportSettings().catch(orNull),
    getClientNames().catch(orNull),
    sourcesOf(report),
  ]);
  return (
    <ReportReview
      view={reviewView(
        report,
        {
          sources,
          delivery,
          settings,
          clientName: names?.get(report.clientId) ?? 'Your client',
          workspaceName: me.workspace.name,
        },
        { timeZone: me.workspace.timeZone, now: new Date() },
      )}
    />
  );
}

/**
 * The records the report cites. A drafted report keeps them as they stood;
 * older ones cite the live records, which are read for whatever's missing.
 */
async function sourcesOf(report: Report): Promise<Map<string, Source>> {
  const kept = new Map(report.sources.map((source) => [source.id, source]));
  const missing = report.sections
    .flatMap((section) => section.lines.flatMap((line) => line.sourceIds))
    .filter((id) => !kept.has(id));
  if (missing.length === 0) return kept;
  const live = (await getSources(missing).catch(orNull)) ?? new Map();
  return new Map([...live, ...kept]);
}
