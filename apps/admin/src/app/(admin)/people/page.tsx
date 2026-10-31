import { Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import {
  EmptyState,
  ErrorState,
  LoadingLabel,
  Skeleton,
} from '@/components/ui/states';
import { searchPeople } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { When } from '@/lib/format';

export const metadata = { title: 'People' };

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export default function PeoplePage({ searchParams }: PageProps<'/people'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-260">
        <header>
          <h1 className="text-title-compact sm:text-title">People</h1>
          <p className="mt-3 max-w-2xl text-text">
            Anyone with a Dossier account, in any workspace. Find someone to
            sign them out everywhere, email them a reset link, or turn off their
            two-factor.
          </p>
        </header>
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function Results({
  searchParams,
}: Pick<PageProps<'/people'>, 'searchParams'>) {
  const q = one((await searchParams).q)?.trim() ?? '';
  const people = q.length >= 2 ? await searchPeople(q).catch(orNull) : [];
  return (
    <div className="mt-8">
      <form action="/people" className="flex items-center gap-2">
        <label htmlFor="people-search" className="sr-only">
          Search people
        </label>
        <span className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            strokeWidth={1.75}
          />
          <input
            id="people-search"
            name="q"
            type="search"
            minLength={2}
            required
            defaultValue={q}
            placeholder="Name or email"
            className="h-9 w-full rounded-full bg-surface pr-3 pl-9 text-body text-ink"
          />
        </span>
        <Button type="submit">Search</Button>
      </form>

      {q.length < 2 ? (
        <EmptyState title="Search for someone" className="mt-4">
          Type at least two letters of their name or email.
        </EmptyState>
      ) : people === null ? (
        <ErrorState what="people" className="mt-4" />
      ) : people.length === 0 ? (
        <EmptyState title={`Nobody matches “${q}”`} className="mt-4" />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card bg-sheet shadow-card">
          <table className="w-full min-w-180 text-left">
            <caption className="sr-only">People matching {q}</caption>
            <thead className="text-meta text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Person
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Workspace
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Two-factor
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Last seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {people.map((person) => (
                <tr
                  key={`${person.id}-${person.workspace?.id}`}
                  className="hover:bg-surface-soft"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/people/${person.id}`}
                      className="font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {person.name}
                    </Link>
                    <span className="block text-meta text-muted">
                      {person.email}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text">
                    {person.workspace ? (
                      <Link
                        href={`/workspaces/${person.workspace.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {person.workspace.name}
                      </Link>
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-text">
                    {person.twoFactor ? (
                      'On'
                    ) : (
                      <span className="text-muted">Off</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-mono whitespace-nowrap text-muted">
                    {person.lastSeenAt ? <When iso={person.lastSeenAt} /> : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {people.length === 50 && (
            <p className="px-4 py-2.5 text-meta text-muted">
              Showing the first 50. Search for more of the name or email.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-8">
      <LoadingLabel what="people" />
      <Skeleton className="h-9 w-full rounded-full" />
    </div>
  );
}
