import Link from 'next/link';
import { SectionHeader } from '@/components/ui/section-header';
import { ErrorState } from '@/components/ui/states';
import { getClients, getPatterns, getSources } from '@/lib/data';
import { orEmpty, orNull } from '@/lib/data/safe';
import { sourceTools } from '@/lib/sources';

const headingId = 'patterns-heading';

/**
 * What several clients have in common, as Dossier found it after syncs:
 * each pattern, what it looks like at each client, and what to do once for
 * all of them. Nothing shows until there's a pattern, or while it's off.
 */
export async function Patterns() {
  const [patterns, clients] = await Promise.all([
    getPatterns().catch(orNull),
    getClients().catch(orEmpty),
  ]);
  if (patterns === null) {
    return (
      <section aria-labelledby={headingId}>
        <SectionHeader id={headingId} title="Across clients" />
        <ErrorState what="patterns across clients" className="mt-3" />
      </section>
    );
  }
  if (patterns.length === 0) return null;

  const sources = await getSources(
    patterns.flatMap((p) => p.clients.flatMap((c) => c.sourceIds)),
  ).catch(orEmpty);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const clientName = new Map(clients.map((client) => [client.id, client.name]));

  return (
    <section aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="Across clients"
        count={patterns.length}
        note="Found by Dossier"
      />
      <ul className="mt-3 flex flex-col gap-3">
        {patterns.map((pattern) => (
          <li
            key={pattern.id}
            className="rounded-card bg-sheet p-4 shadow-card"
          >
            <h3 className="font-medium">{pattern.title}</h3>
            <p className="mt-1.5 text-meta text-text">{pattern.why}</p>
            <ul className="mt-3 divide-y divide-hairline rounded-tile bg-surface-soft">
              {pattern.clients.map((part) => {
                const cited = part.sourceIds.flatMap(
                  (id) => sourceById.get(id) ?? [],
                );
                return (
                  <li
                    key={part.clientId}
                    className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:gap-4"
                  >
                    <Link
                      href={`/clients/${encodeURIComponent(part.clientId)}`}
                      className="shrink-0 text-meta font-medium text-ink underline-offset-2 hover:underline sm:w-44 sm:truncate"
                    >
                      {clientName.get(part.clientId) ?? 'Unknown client'}
                    </Link>
                    <div className="min-w-0">
                      <p className="text-meta text-text">{part.detail}</p>
                      <p className="font-mono text-mono text-muted">
                        {cited.length > 0
                          ? `From ${sourceTools(cited)}`
                          : 'Sources unavailable'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-meta">
              <span className="font-medium text-ink">Once for all: </span>
              <span className="text-text">{pattern.suggestion}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
