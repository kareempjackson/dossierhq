'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { userHref } from '@/lib/client-paths';
import type { UserRow } from '@/lib/client-views';
import { cn } from '@/lib/cn';

const FILTERS = [
  { value: 'all', label: 'All', test: () => true },
  {
    value: 'open',
    label: 'Open tickets',
    test: (user: UserRow) => user.openTickets > 0,
  },
  {
    value: 'contact',
    label: 'Primary contact',
    test: (user: UserRow) => user.primaryContact,
  },
] as const;

/**
 * The people at a client, by name, with their devices, tickets and
 * meetings. Search finds them by name, email or how they sign in.
 */
export function UsersView({
  clientId,
  clientName,
  users,
}: {
  clientId: string;
  clientName: string;
  users: UserRow[];
}) {
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]['value']>('all');
  const [query, setQuery] = useState('');
  const id = useId();
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const test = FILTERS.find((option) => option.value === filter)!.test;
  const shown = users.filter(
    (user) => test(user) && words.every((word) => user.search.includes(word)),
  );

  if (users.length === 0) {
    return (
      <p className="rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
        No one yet. People at {clientName} appear once NinjaOne reports who
        signs in to their devices, or they raise a ticket or join a recorded
        meeting.
      </p>
    );
  }

  return (
    <>
      <p className="text-small text-muted">
        Who signs in to {clientName}’s devices, raises tickets and comes to
        meetings, from your tools. Your own team is left out.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Which people"
          className="flex flex-wrap gap-2"
        >
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                'rounded-full px-3 py-1 text-small transition-colors',
                filter === option.value
                  ? 'bg-white text-ink ring-1 ring-grey-3'
                  : 'bg-grey-2 text-muted hover:text-ink',
              )}
            >
              {option.label} {users.filter(option.test).length}
            </button>
          ))}
        </div>
        <label htmlFor={`${id}-search`} className="sr-only">
          Search people
        </label>
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email, sign-in"
          autoComplete="off"
          className="w-full sm:w-64"
        />
      </div>

      {shown.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-separate border-spacing-y-1 text-left text-small">
            <thead>
              <tr className="text-[0.6875rem] text-muted">
                {[
                  'Person',
                  'Devices',
                  'Tickets',
                  'Meetings',
                  'Last contact',
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-4 pb-2 font-normal"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((user) => (
                <tr
                  key={user.id}
                  className="relative odd:[&>td]:bg-grey-1 [&>td]:transition-colors hover:[&>td]:bg-grey-2"
                >
                  <td className="rounded-l-xl px-4 py-3">
                    <Link
                      href={userHref(clientId, user.id)}
                      className="flex items-center gap-2 rounded-sm font-semibold after:absolute after:inset-0"
                    >
                      {user.name}
                      {user.primaryContact && <Tag tone="drafted">Contact</Tag>}
                    </Link>
                    {user.facts && (
                      <p className="mt-0.5 max-w-md truncate text-[0.75rem] text-muted">
                        {user.facts}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {user.devices}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted tabular-nums">
                    {user.tickets}
                    {user.ticketsRaised !== user.tickets && (
                      <span> ({user.ticketsRaised} raised)</span>
                    )}
                    {user.openTickets > 0 && (
                      <span className="text-ink">
                        {' '}
                        · {user.openTickets} open
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {user.meetings}
                  </td>
                  <td className="rounded-r-xl px-4 py-3 whitespace-nowrap text-muted">
                    {user.lastContact ?? 'None yet'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
          No one matches. Try another name, or All.
        </p>
      )}
    </>
  );
}
