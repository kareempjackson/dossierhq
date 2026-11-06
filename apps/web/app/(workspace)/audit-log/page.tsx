import type { Metadata } from 'next';
import { AuditLog } from '@/components/audit/audit-log';
import { TopBar } from '@/components/shell/top-bar';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';

export const metadata: Metadata = { title: 'Audit log' };

/**
 * Every read, sign-in and change, from the API, a page at a time. The
 * filter and the page are in the URL, read inside Suspense so the frame
 * shows at once.
 */
export default function AuditLogPage({
  searchParams,
}: PageProps<'/audit-log'>) {
  return (
    <>
      <TopBar
        title="Audit log"
        subtitle="Every read, sign-in and change, newest first"
      />
      <div className="mt-6">
        <Reveal
          fallback={
            <IndexLoader
              className="h-[28.5rem]"
              label="Loading the audit log"
            />
          }
        >
          <AuditLog searchParams={searchParams} />
        </Reveal>
      </div>
    </>
  );
}
