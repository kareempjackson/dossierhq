import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard, TextLink } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Skeleton } from '@/components/ui/states';

export const metadata: Metadata = {
  title: 'Choose a new password',
  // The token is in this page's URL; never pass it on to anyone else.
  referrer: 'no-referrer',
};

export default function ResetPasswordPage({
  searchParams,
}: PageProps<'/reset-password'>) {
  return (
    <AuthCard
      title="Choose a new password"
      description="Saving it signs you out of Dossier everywhere else."
      footer={
        <>
          Remembered it? <TextLink href="/sign-in">Sign in</TextLink>
        </>
      }
    >
      <Suspense
        fallback={
          <div aria-hidden className="mt-6 flex flex-col gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-9 w-full rounded-full" />
          </div>
        }
      >
        <Reset searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Reset({
  searchParams,
}: Pick<PageProps<'/reset-password'>, 'searchParams'>) {
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === 'string' ? token : ''} />;
}
