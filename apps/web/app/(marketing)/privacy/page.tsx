import type { Metadata } from 'next';
import {
  LEGAL_EMAIL,
  LegalPlaceholder,
} from '@/components/marketing/legal-placeholder';

export const metadata: Metadata = {
  title: 'Privacy',
  // A placeholder until the policy is written.
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <LegalPlaceholder
      title="Privacy"
      status="Our full privacy policy is being prepared and will be published here."
    >
      <h2 className="mt-10 text-h3">Product updates</h2>
      <p className="mt-3 text-body">
        If you sign up for product updates, we keep your email address, the page
        you signed up on, and when. We use it only to send news about Dossier.
        To be taken off the list, email{' '}
        <a
          href={`mailto:${LEGAL_EMAIL}`}
          className="rounded-sm underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink"
        >
          {LEGAL_EMAIL}
        </a>
        .
      </p>
    </LegalPlaceholder>
  );
}
