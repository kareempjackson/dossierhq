import type { SpendRow } from '@/lib/workspace';

const dollars = (value: number) => `$${value.toFixed(2)}`;

/** What drafting cost in the last 30 days, most expensive first. */
export function Spend({
  rows,
  fromCache,
}: {
  rows: SpendRow[];
  fromCache: number;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-white px-4 py-6 text-small text-muted">
        Nothing drafted in the last 30 days. What each kind of draft costs shows
        here once Dossier starts drafting.
      </p>
    );
  }

  const total = rows.reduce((sum, row) => sum + row.cost, 0);
  const runs = rows.reduce((sum, row) => sum + row.runs, 0);
  const sorted = [...rows].sort((a, b) => b.cost - a.cost);

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
            String(runs),
            `${dollars(total / runs)} a run on average`,
          ],
          [
            'Read from the cache',
            `${fromCache}%`,
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
      <div className="mt-4 overflow-x-auto">
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
            {sorted.map((row) => {
              const share = Math.round((row.cost / total) * 100);
              return (
                <tr key={row.what} className="[&>td]:bg-white">
                  <td className="rounded-l-lg px-3 py-2.5 font-medium">
                    {row.what}
                  </td>
                  <td className="px-3 py-2.5 text-muted tabular-nums">
                    {row.runs}
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {row.tokensRead}{' '}
                    <span className="text-[0.6875rem]">
                      · {row.fromCache}% from cache
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {row.tokensWritten}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {dollars(row.cost)}
                  </td>
                  <td className="rounded-r-lg px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-1.5 w-20 overflow-hidden rounded-full bg-grey-2"
                      >
                        <span
                          className="block h-full rounded-full bg-lilac-deep"
                          style={{ width: `${share}%` }}
                        />
                      </span>
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
              <td className="px-3 tabular-nums">{runs}</td>
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
