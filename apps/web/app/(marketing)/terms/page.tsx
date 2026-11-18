import type { Metadata } from 'next';
import { LegalPlaceholder } from '@/components/marketing/legal-placeholder';

export const metadata: Metadata = {
  title: 'Terms',
  // A placeholder until the terms are written.
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <LegalPlaceholder
      title="Terms"
      status="Our terms of service are being prepared and will be published here."
    />
  );
}
