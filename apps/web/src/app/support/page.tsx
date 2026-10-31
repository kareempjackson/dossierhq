import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { SupportForm } from '@/components/auth/support-form';
import { Skeleton } from '@/components/ui/states';

export const metadata: Metadata = {
  title: 'Support view',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

const footer = 'For Dossier’s staff, from Dossier Admin.';

/** Where a support link from Dossier Admin lands. */
export default function SupportPage({ searchParams }: PageProps<'/support'>) {
  return (
    <AuthCard
      title="Open a support view"
      description="You’ll see this workspace read-only, as its owner does, until the view ends. Its owners can see in their audit log that you looked, and why."
      footer={footer}
    >
      <Suspense
        fallback={<Skeleton className="mt-6 h-10 w-full rounded-full" />}
      >
        <Support searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Support({
  searchParams,
}: Pick<PageProps<'/support'>, 'searchParams'>) {
  const { token } = await searchParams;
  return typeof token === 'string' && token ? (
    <SupportForm token={token} />
  ) : (
    <p role="alert" className="mt-6 text-meta text-text">
      This link is incomplete. Open a new support view from Dossier Admin.
    </p>
  );
}
