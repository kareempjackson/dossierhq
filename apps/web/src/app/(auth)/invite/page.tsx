import type { InvitePreview } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AcceptInviteForm } from '@/components/auth/accept-invite-form';
import { AuthCard, TextLink } from '@/components/auth/auth-card';
import { Skeleton } from '@/components/ui/states';
import { previewInvite } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Join your team',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
};

const ROLE_NAMES: Record<InvitePreview['role'], string> = {
  admin: 'an admin',
  technician: 'a technician',
};

const signIn = (
  <>
    Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
  </>
);

export default function InvitePage({ searchParams }: PageProps<'/invite'>) {
  return (
    <Suspense
      fallback={
        <AuthCard
          title="Join your team"
          description="Checking your invite…"
          footer={signIn}
        >
          <div aria-hidden className="mt-6 flex flex-col gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-9 w-full rounded-full" />
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
  let preview: InvitePreview | null | 'unavailable' = null;
  if (token) {
    preview = await previewInvite(token).catch(() => 'unavailable' as const);
  }

  if (preview === 'unavailable') {
    return (
      <AuthCard
        title="Join your team"
        description="Dossier can’t reach its server right now. Open the link again shortly."
        footer={signIn}
      >
        {null}
      </AuthCard>
    );
  }
  if (!preview) {
    return (
      <AuthCard
        title="This invite can’t be used"
        description="It has expired, was withdrawn, or was already used. Ask whoever invited you to send a new one; each invite works for 7 days."
        footer={signIn}
      >
        {null}
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={`Join ${preview.workspaceName}`}
      description={`${preview.invitedBy} invited you to Dossier as ${ROLE_NAMES[preview.role]}.`}
      footer={signIn}
    >
      <AcceptInviteForm
        token={token}
        email={preview.email}
        workspaceName={preview.workspaceName}
      />
    </AuthCard>
  );
}
