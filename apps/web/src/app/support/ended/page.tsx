import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';

export const metadata: Metadata = {
  title: 'Support view ended',
  robots: { index: false, follow: false },
};

export default function SupportEndedPage() {
  return (
    <AuthCard
      title="The support view has ended"
      description="You’re no longer looking at the workspace. To look again, open a new support view from Dossier Admin."
      footer="For Dossier’s staff, from Dossier Admin."
    >
      {null}
    </AuthCard>
  );
}
