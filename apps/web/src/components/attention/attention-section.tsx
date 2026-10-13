import type { AttentionKind, Urgency } from '@dossierhq/contracts';
import { ListCard, ListCardRow } from '@/components/ui/list-card';
import { SectionHeader } from '@/components/ui/section-header';
import { SourceLine } from '@/components/ui/source-line';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/cn';
import {
  getAttentionItems,
  getClients,
  getSources,
  getWorkspace,
} from '@/lib/data';
import { orEmpty, orNull } from '@/lib/data/safe';

const kindLabels: Record<AttentionKind, string> = {
  alert: 'Alert',
  risk: 'Risk',
  commitment: 'Commitment',
  connection: 'Connection',
};

const urgency: Record<Urgency, { tone: StatusTone; label: string | null }> = {
  critical: { tone: 'failure', label: 'Critical' },
  high: { tone: 'strong', label: 'High' },
  normal: { tone: 'neutral', label: null },
};

type AttentionSectionProps = {
  /** Limit to one client and leave out the client name on each row. */
  clientId?: string;
  className?: string;
};

/** "Needs attention": one floating list, most urgent first. */
export async function AttentionSection({
  clientId,
  className,
}: AttentionSectionProps) {
  const headingId = 'needs-attention-heading';
  const [items, clients, workspace] = await Promise.all([
    getAttentionItems({ clientId }).catch(orNull),
    getClients().catch(orEmpty),
    getWorkspace(),
  ]);
  const sources = items
    ? await getSources(items.flatMap((item) => item.sourceIds)).catch(orEmpty)
    : [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const clientName = new Map(clients.map((client) => [client.id, client.name]));

  return (
    <section aria-labelledby={headingId} className={className}>
      <SectionHeader
        id={headingId}
        title="Needs attention"
        count={items?.length || undefined}
        note={items && items.length > 1 ? 'Most urgent first' : undefined}
      />
      <div className="mt-3">
        {items === null ? (
          <ErrorState what="what needs attention" />
        ) : items.length === 0 ? (
          <EmptyState title="All clear.">
            Dossier reads your tools every 15 minutes and lists anything new
            here, with where it came from.
          </EmptyState>
        ) : (
          <ListCard elevation="float">
            {items.map((item) => {
              const first = sourceById.get(item.sourceIds[0] ?? '');
              const level = urgency[item.urgency];
              // On a client's own page normal items have no meta line, so the
              // title moves up beside the kind label.
              const showMeta = !clientId || level.label !== null;
              const where = item.clientId
                ? (clientName.get(item.clientId) ?? 'Unknown client')
                : 'All clients';

              return (
                <ListCardRow
                  key={item.id}
                  href={
                    clientId
                      ? undefined
                      : item.clientId
                        ? `/clients/${item.clientId}`
                        : '/connections'
                  }
                >
                  <StatusDot
                    tone={level.tone}
                    {...(level.label
                      ? { decorative: true }
                      : { srLabel: 'Normal urgency' })}
                    className="mt-[7px] self-start"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      {showMeta ? (
                        <p className="text-meta text-muted">
                          {!clientId && where}
                          {!clientId && level.label && ' · '}
                          {level.label && (
                            <span
                              className={cn(
                                item.urgency === 'critical'
                                  ? 'text-alert'
                                  : 'text-ink',
                              )}
                            >
                              {level.label}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="font-medium text-ink">{item.title}</p>
                      )}
                      <span className="shrink-0 rounded-full bg-surface px-2.5 py-px text-meta-sm text-muted">
                        {kindLabels[item.kind]}
                      </span>
                    </div>
                    {showMeta && (
                      <p className="mt-0.5 font-medium text-ink">
                        {item.title}
                      </p>
                    )}
                    {first && (
                      <SourceLine
                        source={first}
                        timeZone={workspace.timeZone}
                        more={item.sourceIds.length - 1}
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

export function AttentionSectionSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <section aria-labelledby="needs-attention-heading" className={className}>
      <SectionHeader id="needs-attention-heading" title="Needs attention" />
      <LoadingLabel what="what needs attention" />
      <ul className="mt-3 divide-y divide-hairline rounded-card bg-sheet shadow-float">
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="flex gap-3 px-4 py-4">
            <Skeleton className="mt-1 size-2 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-56" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
