import { ButtonLink } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { getClients, getRecommendations, getSources } from '@/lib/data';
import { sourceTools } from '@/lib/sources';

const headingId = 'new-recommendations-heading';

/** Draft recommendations across all clients, newest first. */
export async function NewRecommendations() {
  const [drafts, clients] = await Promise.all([
    getRecommendations({ status: 'draft' }).catch(() => null),
    getClients().catch(() => []),
  ]);
  const sources = drafts
    ? await getSources(drafts.flatMap((rec) => rec.sourceIds)).catch(() => [])
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const clientName = new Map(clients.map((client) => [client.id, client.name]));

  return (
    <section aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="New recommendations"
        count={drafts?.length || undefined}
        note={drafts && drafts.length > 0 ? 'Drafts, not sent' : undefined}
      />
      <div className="mt-3">
        {drafts === null ? (
          <ErrorState what="recommendations" />
        ) : drafts.length === 0 ? (
          <EmptyState title="No new recommendations.">
            When Dossier spots something worth doing, it drafts it here for you
            to accept, edit or dismiss.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {drafts.map((rec) => {
              const recSources = rec.sourceIds.flatMap(
                (id) => sourceById.get(id) ?? [],
              );
              return (
                <li
                  key={rec.id}
                  className="flex flex-col rounded-card bg-sheet p-4 shadow-card"
                >
                  <p className="text-meta text-muted">
                    {clientName.get(rec.clientId) ?? 'Unknown client'}
                  </p>
                  <h3 className="mt-1 font-medium">{rec.title}</h3>
                  <p className="mt-1.5 text-meta text-text">{rec.reason}</p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <p className="font-mono text-mono text-muted">
                      {recSources.length > 0
                        ? `From ${sourceTools(recSources)}`
                        : 'Sources unavailable'}
                    </p>
                    <ButtonLink
                      href={`/clients/${rec.clientId}#recommendations`}
                    >
                      Review<span className="sr-only">: {rec.title}</span>
                    </ButtonLink>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export function NewRecommendationsSkeleton() {
  return (
    <section aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="New recommendations" />
      <LoadingLabel what="recommendations" />
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {[0, 1].map((card) => (
          <li
            key={card}
            className="flex flex-col gap-2 rounded-card bg-sheet p-4 shadow-card"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-4 h-9 w-24 self-end rounded-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}
