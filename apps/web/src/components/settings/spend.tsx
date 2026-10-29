import type { IntelligenceKind, IntelligenceSpend } from '@dossierhq/contracts';
import { EmptyState } from '@/components/ui/states';
import { formatDollars } from '@/lib/format';

const KIND_NAMES: Record<IntelligenceKind, string> = {
  recommendations: 'Recommendations',
  ask: 'Questions asked',
  meetings: 'Meeting notes',
  reports: 'Weekly reports',
  patterns: 'Patterns across clients',
};

const number = new Intl.NumberFormat('en-GB');

/** Every token sent to Claude, fresh or from the cache. */
const tokensRead = (row: IntelligenceSpend) =>
  row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;

const percent = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 100);

/**
 * What drafting cost: three headline figures, then a row for each kind of
 * work, the costliest first, with its share of the total.
 */
export function Spend({ spend }: { spend: IntelligenceSpend[] }) {
  if (spend.length === 0) {
    return (
      <EmptyState title="Nothing drafted in the last 30 days.">
        What recommendations, reports and answers cost appears here once Dossier
        drafts them.
      </EmptyState>
    );
  }

  const rows = [...spend].sort((a, b) => b.cost - a.cost);
  const total = rows.reduce((sum, row) => sum + row.cost, 0);
  const runs = rows.reduce((sum, row) => sum + row.runs, 0);
  const read = rows.reduce((sum, row) => sum + tokensRead(row), 0);
  const cached = rows.reduce((sum, row) => sum + row.cacheReadTokens, 0);
  const written = rows.reduce((sum, row) => sum + row.outputTokens, 0);
  const cachedShare = percent(cached, read);

  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Figure
          label="Cost"
          value={formatDollars(total)}
          note="In US dollars, at each run’s model’s prices"
        />
        <Figure
          label="Drafting runs"
          value={number.format(runs)}
          note={
            runs === 0
              ? 'None finished'
              : `${formatDollars(total / runs)} a run on average`
          }
        />
        <Figure
          label="Read from the cache"
          value={cachedShare === null ? '–' : `${cachedShare}%`}
          note="Of the tokens Claude read, at the cheaper cache price"
        />
      </dl>

      {/* Columns drop out by the card's width; What, Runs and Cost stay. */}
      <div className="@container overflow-x-auto rounded-card bg-sheet shadow-card">
        <table className="w-full text-body">
          <caption className="sr-only">
            What each kind of drafting cost in the last 30 days
          </caption>
          <thead>
            <tr className="border-b border-hairline text-left text-meta whitespace-nowrap text-muted">
              <th scope="col" className="px-5 py-3 font-medium">
                What
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Runs
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 text-right font-medium @md:table-cell"
              >
                Tokens read
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 text-right font-medium @xl:table-cell"
              >
                Tokens written
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Cost
              </th>
              <th
                scope="col"
                className="hidden py-3 pr-5 pl-4 font-medium @3xl:table-cell"
              >
                Share
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline tabular-nums">
            {rows.map((row) => {
              const share = percent(row.cost, total) ?? 0;
              const fromCache = percent(row.cacheReadTokens, tokensRead(row));
              return (
                <tr
                  key={row.kind}
                  className="transition-colors hover:bg-surface-soft"
                >
                  <th
                    scope="row"
                    className="px-5 py-3 text-left font-normal text-ink"
                  >
                    {KIND_NAMES[row.kind]}
                  </th>
                  <td className="px-4 py-3 text-right">
                    {number.format(row.runs)}
                  </td>
                  <td className="hidden px-4 py-3 text-right @md:table-cell">
                    {number.format(tokensRead(row))}
                    {fromCache !== null && (
                      <span className="block text-meta-sm text-muted">
                        {fromCache}% from cache
                      </span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-right @xl:table-cell">
                    {number.format(row.outputTokens)}
                  </td>
                  <td className="px-4 py-3 text-right text-ink">
                    {formatDollars(row.cost)}
                  </td>
                  <td className="hidden py-3 pr-5 pl-4 @3xl:table-cell">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="h-1.5 w-20 overflow-hidden rounded-full bg-brand-soft"
                      >
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${share}%` }}
                        />
                      </span>
                      <span className="w-9 text-right text-meta text-muted">
                        {share}%
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {/* A cell per column, as some hide in a narrow card. */}
            <tr className="border-t border-hairline font-medium text-ink tabular-nums">
              <th scope="row" className="px-5 py-3 text-left font-medium">
                Total
              </th>
              <td className="px-4 py-3 text-right">{number.format(runs)}</td>
              <td className="hidden px-4 py-3 text-right @md:table-cell">
                {number.format(read)}
              </td>
              <td className="hidden px-4 py-3 text-right @xl:table-cell">
                {number.format(written)}
              </td>
              <td className="px-4 py-3 text-right">{formatDollars(total)}</td>
              <td className="hidden @3xl:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

/** A headline figure: what it is, the number, and what the number means. */
function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex flex-col rounded-card bg-sheet p-4 shadow-card">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="mt-1 text-figure font-semibold text-ink">{value}</dd>
      <dd className="mt-0.5 text-meta-sm text-muted">{note}</dd>
    </div>
  );
}
