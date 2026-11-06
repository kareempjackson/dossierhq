'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ButtonAnchor } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import type { MeetingView } from '@/lib/client-views';
import { cn } from '@/lib/cn';

/**
 * The client's meetings, newest first; the chosen one's summary and promises
 * beside them. `?meeting=` opens a given one, and choosing one puts it in
 * the URL, so a meeting can be linked to.
 */
export function MeetingsView({ meetings }: { meetings: MeetingView[] }) {
  const linked = useSearchParams().get('meeting');
  const [meetingId, setMeetingId] = useState(linked ?? meetings[0]?.id);
  const meeting =
    meetings.find((candidate) => candidate.id === meetingId) ?? meetings[0];

  if (!meeting) {
    return (
      <p className="rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
        No meetings yet. Connect Fathom to bring in client calls.
      </p>
    );
  }

  const choose = (id: string) => {
    setMeetingId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('meeting', id);
    window.history.replaceState(null, '', url);
  };

  return (
    <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Meetings">
        <ul className="flex flex-col gap-1">
          {meetings.map((each) => (
            <li key={each.id}>
              <button
                type="button"
                aria-current={each.id === meeting.id ? 'true' : undefined}
                onClick={() => choose(each.id)}
                className={cn(
                  'w-full rounded-xl px-3.5 py-3 text-left transition-colors',
                  each.id === meeting.id ? 'bg-grey-1' : 'hover:bg-grey-1/60',
                )}
              >
                <span className="block text-small font-medium">
                  {each.title}
                </span>
                <span className="mt-0.5 block text-[0.75rem] text-muted">
                  {each.date} · {each.minutes} min
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <article aria-labelledby="meeting-title" className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.75rem] text-muted">
              Fathom · {meeting.date} · {meeting.minutes} min
            </p>
            <h2 id="meeting-title" className="mt-1 text-h2">
              {meeting.title}
            </h2>
          </div>
          {meeting.url && (
            <ButtonAnchor
              href={meeting.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              size="sm"
            >
              Open in Fathom
            </ButtonAnchor>
          )}
        </div>
        <p className="mt-2 text-small text-muted">
          {meeting.attendees.join(', ')}
        </p>

        <div className="mt-5 rounded-2xl bg-grey-1 p-4">
          <p className="text-[0.75rem] text-muted">Fathom’s summary</p>
          <p className="mt-1.5 text-small leading-relaxed whitespace-pre-line">
            {meeting.summary ?? 'Fathom didn’t write a summary for this one.'}
          </p>
        </div>

        <h3 className="mt-8 font-sans text-[0.75rem] font-normal tracking-normal text-muted">
          Promises made in this meeting
        </h3>
        {meeting.promises.length > 0 ? (
          <ul className="mt-2 flex flex-col">
            {meeting.promises.map((promise) => (
              <li
                key={promise.id}
                className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 odd:bg-grey-1/60"
              >
                <div className="min-w-0">
                  <p className="text-small font-medium">{promise.title}</p>
                  <p className="text-[0.75rem] text-muted">{promise.due}</p>
                </div>
                <Tag tone={promise.status.tone}>{promise.status.label}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 px-3 text-small text-muted">
            No action items in this meeting.
          </p>
        )}

        <h3 className="mt-6 font-sans text-[0.75rem] font-normal tracking-normal text-muted">
          Client plans and concerns
        </h3>
        {meeting.points.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {meeting.points.map((point) => (
              <li
                key={point}
                className="rounded-full bg-grey-2 px-3 py-1 text-small text-muted"
              >
                {point}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 px-3 text-small text-muted">
            {meeting.read
              ? 'None mentioned.'
              : 'Dossier hasn’t read this meeting yet.'}
          </p>
        )}
      </article>
    </div>
  );
}
