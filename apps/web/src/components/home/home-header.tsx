import { Skeleton } from '@/components/ui/states';
import {
  getAttentionItems,
  getClients,
  getNow,
  getRecommendations,
  getReportSummaries,
  getWorkspace,
} from '@/lib/data';
import { formatList, formatLongDay, plural } from '@/lib/format';
import { orEmpty, orNull } from '@/lib/data/safe';

export async function HomeHeader() {
  const [items, recommendations, reports, clients, workspace, now] =
    await Promise.all([
      getAttentionItems().catch(orNull),
      getRecommendations({ status: 'draft' }).catch(orEmpty),
      getReportSummaries().catch(orEmpty),
      getClients().catch(orEmpty),
      getWorkspace(),
      getNow(),
    ]);

  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const critical = items?.filter((item) => item.urgency === 'critical') ?? [];
  const criticalClients = [
    ...new Set(
      critical.flatMap((item) =>
        item.clientId ? (clientName.get(item.clientId) ?? []) : [],
      ),
    ),
  ];
  const toReview = reports.filter((report) => report.status === 'draft').length;

  const waiting = [
    recommendations.length > 0 &&
      plural(recommendations.length, 'recommendation'),
    toReview > 0 && plural(toReview, 'report'),
  ].filter((part): part is string => Boolean(part));
  const waitingCount = recommendations.length + toReview;

  const summary = [
    critical.length > 0 &&
      `${critical.length} ${critical.length === 1 ? 'is' : 'are'} critical${
        criticalClients.length > 0 ? `, at ${formatList(criticalClients)}` : ''
      }.`,
    waiting.length > 0 &&
      `${formatList(waiting)} ${waitingCount === 1 ? 'is' : 'are'} waiting for review.`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header>
      <p className="text-meta text-muted">
        {formatLongDay(now, workspace.timeZone)}
      </p>
      <h1 className="mt-2 text-title-compact sm:text-title">
        {items === null
          ? 'Here’s where your clients stand.'
          : items.length === 0
            ? 'Nothing needs your attention.'
            : `${plural(items.length, 'thing')} ${items.length === 1 ? 'needs' : 'need'} your attention.`}
      </h1>
      {summary && <p className="mt-3 text-text">{summary}</p>}
    </header>
  );
}

export function HomeHeaderSkeleton() {
  return (
    <header aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-9 w-full max-w-md" />
      <Skeleton className="mt-4 h-4 w-full max-w-lg" />
    </header>
  );
}
