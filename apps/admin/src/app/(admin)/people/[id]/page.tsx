import { hasStaffRole, type WorkspaceRole } from '@dossierhq/contracts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PersonActions } from '@/components/people/person-actions';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/states';
import { getMe, getPerson } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { When, formatDate } from '@/lib/format';

export const metadata = { title: 'Person' };

const ROLE_NAMES: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  technician: 'Technician',
};

export default function PersonPage({ params }: PageProps<'/people/[id]'>) {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-220">
        <Suspense
          fallback={
            <div aria-hidden>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-6 h-10 w-80 max-w-full" />
            </div>
          }
        >
          <Person params={params} />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function Person({ params }: Pick<PageProps<'/people/[id]'>, 'params'>) {
  const { id } = await params;
  const [person, me] = await Promise.all([
    getPerson(id),
    getMe().catch(orNull),
  ]);
  if (!person) notFound();
  const manage = me ? hasStaffRole(me.staff.role, 'admin') : false;
  const facts = [
    {
      label: 'Workspace',
      value: person.workspace ? (
        <Link
          href={`/workspaces/${person.workspace.id}`}
          className="underline underline-offset-2"
        >
          {person.workspace.name}
        </Link>
      ) : (
        'None'
      ),
    },
    { label: 'Role', value: person.role ? ROLE_NAMES[person.role] : '–' },
    { label: 'Title', value: person.title || '–' },
    { label: 'Two-factor sign-in', value: person.twoFactor ? 'On' : 'Off' },
    {
      label: 'Signed in on',
      value: `${person.sessions} ${person.sessions === 1 ? 'browser' : 'browsers'}`,
    },
    {
      label: 'Last seen',
      value: person.lastSeenAt ? (
        <When iso={person.lastSeenAt} />
      ) : (
        'Not recently'
      ),
    },
    { label: 'Account made', value: formatDate(person.createdAt) },
  ];
  return (
    <>
      <Breadcrumb
        items={[{ label: 'People', href: '/people' }, { label: person.name }]}
      />
      <h1 className="mt-4 text-title-compact sm:text-title">{person.name}</h1>
      <p className="mt-2 text-text">{person.email}</p>
      <dl className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-meta text-muted">{fact.label}</dt>
            <dd className="mt-0.5 text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {manage && (
        <PersonActions
          id={person.id}
          name={person.name}
          twoFactor={person.twoFactor}
          sessions={person.sessions}
        />
      )}
    </>
  );
}
