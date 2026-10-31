import { hasStaffRole } from '@dossierhq/contracts';
import { Suspense } from 'react';
import { StaffManager } from '@/components/staff/staff-manager';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingLabel, Skeleton } from '@/components/ui/states';
import { getMe, getStaff } from '@/lib/data';
import { orNull } from '@/lib/data/safe';

export const metadata = { title: 'Staff' };

export default function StaffPage() {
  return (
    <Sheet scroll="md" className="flex-1 px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-220">
        <header>
          <h1 className="text-title-compact sm:text-title">Staff</h1>
          <p className="mt-3 max-w-2xl text-text">
            Who at Dossier can sign in here. Everyone signs in with an
            authenticator app, and everything they do is in the activity log.
          </p>
        </header>
        <Suspense
          fallback={
            <div className="mt-8">
              <LoadingLabel what="staff" />
              <Skeleton className="h-40 w-full rounded-card" />
            </div>
          }
        >
          <StaffList />
        </Suspense>
      </div>
    </Sheet>
  );
}

async function StaffList() {
  const [list, me] = await Promise.all([
    getStaff().catch(orNull),
    getMe().catch(orNull),
  ]);
  if (!list || !me) return <ErrorState what="staff" className="mt-8" />;
  return (
    <StaffManager
      staff={list.data}
      invites={list.invites}
      meId={me.staff.id}
      canManage={hasStaffRole(me.staff.role, 'admin')}
    />
  );
}
