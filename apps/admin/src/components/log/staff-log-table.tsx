import type { StaffAuditEntry } from '@dossierhq/contracts';
import Link from 'next/link';
import { StatusDot } from '@/components/ui/status-dot';
import { When } from '@/lib/format';

/** The staff log as a table; shared with a workspace's Support tab. */
export function StaffLogTable({
  entries,
  showWorkspace = true,
}: {
  entries: StaffAuditEntry[];
  showWorkspace?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-card bg-sheet shadow-card">
      <table className="w-full min-w-180 text-left">
        <caption className="sr-only">What staff did, newest first</caption>
        <thead className="text-meta text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Time
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Who
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              What
            </th>
            {showWorkspace && (
              <th scope="col" className="px-4 py-2.5 font-medium">
                Workspace
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-2.5 font-mono text-mono whitespace-nowrap text-muted">
                <When iso={entry.at} />
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-text">
                {entry.staff ? (
                  <span title={entry.staff.email}>{entry.staff.name}</span>
                ) : (
                  <span className="text-muted">Command line</span>
                )}
                {entry.ip && (
                  <span className="block font-mono text-mono text-muted">
                    <span className="sr-only">from </span>
                    {entry.ip}
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-text">
                {entry.what}
                {entry.outcome === 'failed' && (
                  <StatusDot
                    tone="failure"
                    label="Failed"
                    className="mt-1 text-meta-sm text-muted"
                  />
                )}
              </td>
              {showWorkspace && (
                <td className="px-4 py-2.5 text-muted">
                  {entry.workspaceId ? (
                    <Link
                      href={`/workspaces/${entry.workspaceId}`}
                      className="underline underline-offset-2 hover:text-ink"
                    >
                      Open
                    </Link>
                  ) : (
                    '–'
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
