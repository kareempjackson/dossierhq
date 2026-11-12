import { hasRole, TOOL_NAMES, toolSchema } from '@dossierhq/contracts';
import { Suspense, type ReactNode } from 'react';
import { AuditNavProvider } from '@/components/audit/audit-nav';
import { AuditTabs } from '@/components/audit/audit-tabs';
import { TopBar } from '@/components/shell/top-bar';
import { getMe } from '@/lib/data/auth';
import { orNull } from '@/lib/data/safe';

/**
 * The audit log's frame: its title and tabs. A layout outlasts the pages
 * under it, so moving between tabs and pages leaves these in place, and
 * only the entries change.
 */
export default function AuditLogLayout({ children }: { children: ReactNode }) {
  return (
    <AuditNavProvider>
      <TopBar
        title="Audit log"
        subtitle="Every read, sign-in and change, newest first"
      />
      <div className="mt-6">
        {/* Holds the row's height until the tabs know who's asking. */}
        <Suspense fallback={<div aria-hidden className="h-7" />}>
          <Tabs />
        </Suspense>
        {children}
      </div>
    </AuditNavProvider>
  );
}

async function Tabs() {
  const me = await getMe().catch(orNull);
  if (!me) return null;
  return (
    <AuditTabs
      everything={hasRole(me.role, 'admin')}
      tools={toolSchema.options.map((id) => ({ id, name: TOOL_NAMES[id] }))}
    />
  );
}
