import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard, TextLink } from '@/components/auth/auth-card';
import { SignInForm } from '@/components/auth/sign-in-form';
import { Skeleton } from '@/components/ui/states';
import { safeNextPath } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

/** A single card on the ground; the form streams in once the URL is read. */
export default function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  return (
    <AuthCard
      title="Sign in"
      description="What needs attention at every client, and why."
      footer={
        <>
          New to Dossier?{' '}
          <TextLink href="/sign-up">Create your workspace</TextLink>
        </>
      }
    >
      <Suspense fallback={<SignInFormSkeleton />}>
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

function SignInFormSkeleton() {
  return (
    <div aria-hidden className="mt-6 flex flex-col gap-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-9 w-full rounded-full" />
    </div>
  );
}
