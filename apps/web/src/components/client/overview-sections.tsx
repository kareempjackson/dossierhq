import { Check } from 'lucide-react';
import { ListCard, ListCardRow } from '@/components/ui/list-card';
import { SectionHeader } from '@/components/ui/section-header';
import { SourceLine } from '@/components/ui/source-line';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import {
  getCommitments,
  getNow,
  getRecommendations,
  getSources,
  getWorkspace,
} from '@/lib/data';
import { formatCalendarDate, formatDate, formatDateTime } from '@/lib/format';
import {
  DecidedRecommendation,
  RecommendationCard,
} from './recommendation-card';

export async function RecommendationsSection({
  clientId,
}: {
  clientId: string;
}) {
  const [all, workspace, now] = await Promise.all([
    getRecommendations({ clientId }).catch(() => null),
    getWorkspace(),
    getNow(),
  ]);
  const drafts = all?.filter((rec) => rec.status === 'draft') ?? null;
  // Decisions from the last week stay visible, so they can be undone.
  const weekAgo = new Date(
    new Date(now).getTime() - 7 * 86_400_000,
  ).toISOString();
  const decided = (all ?? [])
    .filter((rec) => rec.status !== 'draft' && (rec.decidedAt ?? '') >= weekAgo)
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
  const sources = drafts
    ? await getSources(drafts.flatMap((rec) => rec.sourceIds)).catch(() => [])
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return (
    <section
      id="recommendations"
      aria-labelledby="recommendations-heading"
      className="scroll-mt-6"
    >
      <SectionHeader
        id="recommendations-heading"
        title="Recommendations"
        count={drafts?.length || undefined}
        note={drafts && drafts.length > 0 ? 'Drafts, not sent' : undefined}
      />
      <div className="mt-3">
        {drafts === null ? (
          <ErrorState what="recommendations" />
        ) : drafts.length === 0 ? (
          <EmptyState title="No recommendations to review.">
            Dossier drafts one when something in this client’s records or
            meetings is worth acting on.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {drafts.map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                sources={rec.sourceIds.flatMap(
                  (id) => sourceById.get(id) ?? [],
                )}
                timeZone={workspace.timeZone}
              />
            ))}
          </ul>
        )}
        {decided.length > 0 && (
          <div className="mt-4">
            <h3 className="text-meta font-medium text-muted">
              Decided this week
            </h3>
            <ul className="mt-2 divide-y divide-hairline rounded-card bg-surface-soft">
              {decided.map((rec) => (
                <DecidedRecommendation
                  key={rec.id}
                  recommendation={rec}
                  decidedLabel={`${rec.status === 'accepted' ? 'Accepted' : 'Dismissed'} ${
                    rec.decidedAt
                      ? formatDateTime(rec.decidedAt, workspace.timeZone)
                      : ''
                  }`}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export async function CommitmentsSection({ clientId }: { clientId: string }) {
  const [commitments, workspace, now] = await Promise.all([
    getCommitments({ clientId }).catch(() => null),
    getWorkspace(),
    getNow(),
  ]);
  const sources = commitments
    ? await getSources(commitments.map((c) => c.sourceIds[0] ?? '')).catch(
        () => [],
      )
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const open = commitments?.filter((c) => c.status === 'open').length ?? 0;
  const today = now.slice(0, 10);

  return (
    <section aria-labelledby="commitments-heading">
      <SectionHeader
        id="commitments-heading"
        title="Open commitments"
        count={commitments ? open : undefined}
        note={commitments?.length ? 'What the client was told' : undefined}
      />
      <div className="mt-3">
        {commitments === null ? (
          <ErrorState what="commitments" />
        ) : commitments.length === 0 ? (
          <EmptyState title="Nothing promised is outstanding.">
            When someone tells this client they will do something in a meeting,
            Dossier tracks it here until it is done.
          </EmptyState>
        ) : (
          <ListCard>
            {commitments.map((commitment) => {
              const source = sourceById.get(commitment.sourceIds[0] ?? '');
              const overdue =
                commitment.status === 'open' &&
                commitment.dueOn !== null &&
                commitment.dueOn < today;
              const status =
                commitment.status === 'done'
                  ? `Done ${commitment.completedAt ? formatDate(commitment.completedAt, workspace.timeZone) : ''}`
                  : overdue
                    ? `Overdue, was due ${formatCalendarDate(commitment.dueOn!)}`
                    : commitment.dueOn
                      ? `Open, due ${formatCalendarDate(commitment.dueOn)}`
                      : 'Open';

              return (
                <ListCardRow key={commitment.id}>
                  {commitment.status === 'done' ? (
                    <span
                      aria-hidden
                      className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep"
                    >
                      <Check className="size-3" strokeWidth={2.5} />
                    </span>
                  ) : (
                    <StatusDot
                      tone={overdue ? 'strong' : 'neutral'}
                      decorative
                      className="mt-1.5 self-start"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        commitment.status === 'done'
                          ? 'text-muted'
                          : 'font-medium text-ink'
                      }
                    >
                      {commitment.statement}
                    </p>
                    <p
                      className={`mt-0.5 text-meta ${overdue ? 'font-medium text-ink' : 'text-muted'}`}
                    >
                      {status}
                    </p>
                    {source && (
                      <SourceLine
                        source={source}
                        timeZone={workspace.timeZone}
                        more={commitment.sourceIds.length - 1}
                        className="mt-1"
                      />
                    )}
                  </div>
                </ListCardRow>
              );
            })}
          </ListCard>
        )}
      </div>
    </section>
  );
}

export function SectionSkeleton({
  title,
  rows = 2,
}: {
  title: string;
  rows?: number;
}) {
  return (
    <section>
      <SectionHeader id={`${title}-loading`} title={title} />
      <LoadingLabel what={title.toLowerCase()} />
      <div className="mt-3 flex flex-col gap-3 rounded-card bg-sheet p-4 shadow-card">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}
