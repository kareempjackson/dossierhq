import { hasRole } from '@dossierhq/contracts';
import type { Metadata } from 'next';
import { ReadFailed } from '@/components/clients/client-tab';
import { IntelligenceSettings } from '@/components/intelligence/intelligence-settings';
import { TopBar } from '@/components/shell/top-bar';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';
import { getMe } from '@/lib/data/auth';
import { getIntelligence } from '@/lib/data/intelligence';
import { orNull } from '@/lib/data/safe';
import { intelligenceView } from '@/lib/settings-views';

export const metadata: Metadata = { title: 'Intelligence' };

export default function IntelligencePage() {
  return (
    <>
      <TopBar
        title="Intelligence"
        subtitle="What Dossier drafts, what it looks for, and what the model may read"
      />
      <Reveal
        fallback={
          <div className="mt-6">
            <IndexLoader className="h-180" label="Loading how Dossier drafts" />
          </div>
        }
      >
        <Settings />
      </Reveal>
    </>
  );
}

async function Settings() {
  const [me, settings] = await Promise.all([
    getMe(),
    getIntelligence().catch(orNull),
  ]);
  if (settings === null) {
    return (
      <div className="mt-6">
        <ReadFailed what="how Dossier drafts" />
      </div>
    );
  }
  return (
    <IntelligenceSettings
      view={intelligenceView(settings)}
      canManage={hasRole(me.role, 'admin')}
    />
  );
}
