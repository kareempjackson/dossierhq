import { joinMeta, MobileList, MobileRow } from '@/components/ui/list';
import { cn } from '@/lib/cn';
import type { SpendRow, SpendView } from '@/lib/settings-views';

const dollars = (value: number) => `$${value.toFixed(2)}`;
const number = new Intl.NumberFormat('en-GB');

/** What drafting cost in the last 30 days, most expensive first. */
export function Spend({ spend }: { spend: SpendView }) {
  const { rows, total, runs, fromCache } = spend;
  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-white px-4 py-6 text-small text-muted">
        Nothing drafted in the last 30 days. What each kind of draft costs shows
        here once Dossier starts drafting.
      </p>
    );
  }

  return (
    <>
      <dl className="grid gap-2 sm:grid-cols-3">
        {[
          [
            'Cost',
            dollars(total),
            'In US dollars, at each run’s model’s prices',
          ],
          [
            'Drafting runs',
            number.format(runs),
            runs === 0
              ? 'None finished'
              : `${dollars(total / runs)} a run on average`,
          ],
          [
            'Read from the cache',
            fromCache === null ? '–' : `${fromCache}%`,
            'Of the tokens the model read, at the cheaper cache price',
          ],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-xl bg-white p-4">
            <dt className="text-[0.75rem] text-muted">{label}</dt>
            <dd className="mt-1 font-display text-h2">{value}</dd>
            <dd className="mt-1 text-[0.6875rem] text-muted">{detail}</dd>
          </div>
        ))}
      </dl>
      <SpendList rows={rows} total={total} />
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] border-separate border-spacing-y-1 text-left text-small">
          <thead>
            <tr className="text-[0.6875rem] text-muted">
              {[
                'What',
                'Runs',
                'Tokens read',
                'Tokens written',
                'Cost',
                'Share',
              ].map((heading) => (
                <th key={heading} scope="col" className="px-3 pb-1 font-normal">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const share = shareOf(row, total);
              return (
                <tr key={row.kind} className="[&>td]:bg-white">
                  <td className="rounded-l-lg px-3 py-2.5 font-medium">
                    {row.what}
                  </td>
                  <td className="px-3 py-2.5 text-muted tabular-nums">
                    {number.format(row.runs)}
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {row.tokensRead}
                    {row.fromCache !== null && (
                      <span className="text-[0.6875rem]">
                        {' '}
                        · {row.fromCache}% from cache
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {row.tokensWritten}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {dollars(row.cost)}
                  </td>
                  <td className="rounded-r-lg px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <ShareBar share={share} className="w-20" />
                      <span className="text-[0.75rem] text-muted tabular-nums">
                        {share}%
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="[&>td]:pt-2">
              <td className="px-3 font-medium">Total</td>
              <td className="px-3 tabular-nums">{number.format(runs)}</td>
              <td className="px-3" />
              <td className="px-3" />
              <td className="px-3 font-medium tabular-nums">
                {dollars(total)}
              </td>
              <td className="px-3" />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Each kind's percent of the total cost, rounded. */
const shareOf = (row: SpendRow, total: number) =>
  total === 0 ? 0 : Math.round((row.cost / total) * 100);

/** A thin bar filled to a kind's share of the cost. */
function ShareBar({ share, className }: { share: number; className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block h-1.5 overflow-hidden rounded-full bg-grey-2',
        className,
      )}
    >
      <span
        className="block h-full rounded-full bg-lilac-deep"
        style={{ width: `${share}%` }}
      />
    </span>
  );
}

/**
 * The same kinds on a phone, one row each with its cost at the right. The
 * totals are in the tiles above, so there's no total row.
 */
function SpendList({ rows, total }: { rows: SpendRow[]; total: number }) {
  return (
    <MobileList label="What each kind of draft cost" className="mt-4">
      {rows.map((row) => {
        const share = shareOf(row, total);
        return (
          <MobileRow
            key={row.kind}
            className="bg-white!"
            title={row.what}
            aside={<span className="tabular-nums">{dollars(row.cost)}</span>}
            meta={joinMeta(
              `${number.format(row.runs)} ${row.runs === 1 ? 'run' : 'runs'}`,
              row.fromCache !== null
                ? `${row.tokensRead} tokens read, ${row.fromCache}% from cache`
                : `${row.tokensRead} tokens read`,
              `${row.tokensWritten} written`,
            )}
          >
            <span className="mt-2 flex items-center gap-2">
              <ShareBar share={share} className="flex-1" />
              <span className="text-[0.75rem] text-muted tabular-nums">
                {share}% of the cost
              </span>
            </span>
          </MobileRow>
        );
      })}
    </MobileList>
  );
}
