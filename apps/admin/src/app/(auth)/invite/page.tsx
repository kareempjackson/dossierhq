import type { StaffInvitePreview } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { JoinStaffForm } from '@/components/auth/join-staff-form';
import { Skeleton } from '@/components/ui/states';
import { previewInvite } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Join the staff',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
};

const AS_ROLE: Record<StaffInvitePreview['role'], string> = {
  support: 'support',
  admin: 'an admin',
};

export default function InvitePage({ searchParams }: PageProps<'/invite'>) {
  return (
    <Suspense
      fallback={
        <AuthCard title="Join the staff" description="Checking your invite…">
          <div aria-hidden className="mt-6 flex flex-col gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </AuthCard>
      }
    >
      <Invite searchParams={searchParams} />
    </Suspense>
  );
}

async function Invite({
  searchParams,
}: Pick<PageProps<'/invite'>, 'searchParams'>) {
  const { token: raw } = await searchParams;
  const token = typeof raw === 'string' ? raw : '';
  const preview = token
    ? await previewInvite(token).catch(() => 'unavailable' as const)
    : null;

  if (preview === 'unavailable') {
    return (
      <AuthCard
        title="Join the staff"
        description="Dossier Admin can’t reach its server right now. Try the link again shortly."
      >
        {null}
      </AuthCard>
    );
  }
  if (!preview) {
    return (
      <AuthCard
        title="This invite can’t be used"
        description="It has expired, was withdrawn, or was already used. Ask an admin for a new one."
      >
        {null}
      </AuthCard>
    );
  }
  return (
    <AuthCard
      wide
      title="Join the staff"
      description={`${preview.invitedBy} invited ${preview.email} to join as ${AS_ROLE[preview.role]}. Staff sign in with a password and an authenticator app.`}
    >
      <JoinStaffForm token={token} />
    </AuthCard>
  );
}
