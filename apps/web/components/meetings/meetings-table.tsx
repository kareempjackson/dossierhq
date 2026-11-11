import Link from 'next/link';
import { Tag } from '@/components/ui/tag';
import type { MeetingRow } from '@/lib/client-views';

/**
 * Every client's meetings, newest first. A row opens the meeting on its
 * client's Meetings tab, with Fathom's summary and what was promised.
 */
export function MeetingsTable({ meetings }: { meetings: MeetingRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-separate border-spacing-y-1 text-left text-small">
        <thead>
          <tr className="text-[0.6875rem] text-muted">
            {['Meeting', 'Client', 'When', 'Promises'].map((heading) => (
              <th key={heading} scope="col" className="px-4 pb-2 font-normal">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meetings.map((meeting) => (
            <tr
              key={meeting.id}
              className="relative odd:[&>td]:bg-grey-1 [&>td]:transition-colors hover:[&>td]:bg-grey-2"
            >
              <td className="rounded-l-xl px-4 py-3.5">
                <Link
                  href={meeting.href}
                  className="rounded-sm font-semibold after:absolute after:inset-0"
                >
                  {meeting.title}
                </Link>
                {meeting.attendees && (
                  <span className="mt-0.5 block text-[0.75rem] text-muted">
                    {meeting.attendees}
                  </span>
                )}
              </td>
              <td className="px-4 py-3.5">{meeting.client}</td>
              <td
                className="px-4 py-3.5 whitespace-nowrap text-muted"
                title={meeting.at}
              >
                {meeting.when}
              </td>
              <td className="rounded-r-xl px-4 py-3.5">
                {meeting.promises ? (
                  <Tag tone={meeting.promises.tone}>
                    {meeting.promises.label}
                  </Tag>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
