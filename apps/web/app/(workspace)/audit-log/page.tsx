import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuditCounts, AuditLog } from '@/components/audit/audit-log';
import { AuditEntries } from '@/components/audit/audit-nav';
import { IndexLoader } from '@/components/ui/index-loader';
import { Reveal } from '@/components/ui/reveal';

export const metadata: Metadata = { title: 'Audit log' };

/**
 * Every read, sign-in and change, from the API, a page at a time. The view
 * and the page are in the URL, read inside Suspense so the frame (the
 * layout's title and tabs) shows at once. The counts load beside the
 * entries, not before them.
 */
export default function AuditLogPage({
  searchParams,
}: PageProps<'/audit-log'>) {
  return (
    <>
      <Suspense fallback={null}>
        <AuditCounts searchParams={searchParams} />
      </Suspense>
      <AuditEntries>
        <Reveal
          fallback={
            <IndexLoader
              className="mt-4 h-[26rem]"
              label="Loading the audit log"
            />
          }
        >
          <AuditLog searchParams={searchParams} />
        </Reveal>
      </AuditEntries>
    </>
  );
}
