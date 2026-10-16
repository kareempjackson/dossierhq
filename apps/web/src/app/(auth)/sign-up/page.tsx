import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/auth-card';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create your workspace' };

const zones = Intl.supportedValuesOf('timeZone');
const timeZones = zones.includes('UTC') ? zones : ['UTC', ...zones];

/** Anyone can sign up: each account starts its own workspace, as its owner. */
export default function SignUpPage() {
  return (
    <AuthCard
      wide
      title="Create your workspace"
      description="Set up Dossier for your company and an account for yourself. You’ll connect your tools next."
      footer={
        <>
          Already have an account? <TextLink href="/sign-in">Sign in</TextLink>
        </>
      }
    >
      <SignUpForm timeZones={timeZones} />
    </AuthCard>
  );
}
