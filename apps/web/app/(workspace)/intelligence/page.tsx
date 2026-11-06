import type { Metadata } from 'next';
import { IntelligenceSettings } from '@/components/intelligence/intelligence-settings';
import { TopBar } from '@/components/shell/top-bar';
import { getWorkspace } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Intelligence' };

export default function IntelligencePage() {
  return (
    <>
      <TopBar
        title="Intelligence"
        subtitle="What Dossier drafts, what it looks for, and what the model may read"
      />
      <IntelligenceSettings settings={getWorkspace().intelligence} />
    </>
  );
}
