import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { SignInForm } from '@/components/auth/sign-in-form';
import { Skeleton } from '@/components/ui/states';
import { safeNextPath } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  return (
    <AuthCard
      title="Sign in"
      description="Your password, then a code from your authenticator app."
    >
      <Suspense fallback={<FormSkeleton />}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function SignIn({
  searchParams,
}: Pick<PageProps<'/sign-in'>, 'searchParams'>) {
  const params = await searchParams;
  return (
    <SignInForm
      next={safeNextPath(params.next)}
      expired={params.expired === '1'}
    />
  );
}

function FormSkeleton() {
  return (
    <div aria-hidden className="mt-6 flex flex-col gap-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-9 w-full rounded-full" />
    </div>
  );
}
