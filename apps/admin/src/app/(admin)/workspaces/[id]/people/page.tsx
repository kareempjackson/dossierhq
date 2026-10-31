import type { WorkspaceRole } from '@dossierhq/contracts';
import Link from 'next/link';
import { Suspense } from 'react';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { EmptyState } from '@/components/ui/states';
import {
  WorkspaceSheet,
  WorkspaceSheetSkeleton,
  loadWorkspace,
} from '@/components/workspace/workspace-sheet';
import { When, formatDate } from '@/lib/format';

export const metadata = { title: 'People' };

const ROLE_NAMES: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  technician: 'Technician',
};

export default function WorkspacePeoplePage({
  params,
}: PageProps<'/workspaces/[id]/people'>) {
  return (
    <Suspense fallback={<WorkspaceSheetSkeleton />}>
      <People params={params} />
    </Suspense>
  );
}

async function People({
  params,
}: Pick<PageProps<'/workspaces/[id]/people'>, 'params'>) {
  const detail = await loadWorkspace(params);
  return (
    <WorkspaceSheet detail={detail} tab="people">
      <div className="overflow-x-auto rounded-card bg-sheet shadow-card">
        <table className="w-full min-w-180 text-left">
          <caption className="sr-only">People in the workspace</caption>
          <thead className="text-meta text-muted">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Person
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Role
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Two-factor
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Last seen
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Signed in on
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {detail.members.map((person) => (
              <tr key={person.id} className="hover:bg-surface-soft">
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
                <td className="px-4 py-2.5">
                  {person.role && (
                    <Pill
                      tone={person.role === 'owner' ? 'positive' : 'neutral'}
                    >
                      {ROLE_NAMES[person.role]}
                    </Pill>
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
                <td className="px-4 py-2.5 text-right text-text tabular-nums">
                  {person.sessions}{' '}
                  {person.sessions === 1 ? 'browser' : 'browsers'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="invites-heading" className="mt-10">
        <h2 id="invites-heading" className="text-section font-medium text-ink">
          Invited <span className="text-muted">{detail.invites.length}</span>
        </h2>
        {detail.invites.length === 0 ? (
          <EmptyState title="No invites waiting" className="mt-3" />
        ) : (
          <ListCard className="mt-3">
            {detail.invites.map((invite) => (
              <li key={invite.id} className="px-4 py-3">
                <span className="block text-ink">{invite.email}</span>
                <span className="block text-meta text-muted">
                  {ROLE_NAMES[invite.role]} · invited by {invite.invitedBy} ·
                  until {formatDate(invite.expiresAt)}
                </span>
              </li>
            ))}
          </ListCard>
        )}
      </section>
    </WorkspaceSheet>
  );
}
