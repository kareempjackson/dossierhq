'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { ButtonAnchor } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import type { MeetingView } from '@/lib/client-views';
import { cn } from '@/lib/cn';

/**
 * The client's meetings, newest first; the chosen one's summary and promises
 * beside them. `?meeting=` opens a given one, and choosing one puts it in
 * the URL, so a meeting can be linked to. On a phone there's no room beside
 * the list, so it's the list, then the meeting in its place: a step in the
 * browser's history, so going back returns to the list.
 */
export function MeetingsView({
  meetings,
  fathomConnected,
}: {
  meetings: MeetingView[];
  /** False only when the API says Fathom isn't connected. */
  fathomConnected: boolean;
}) {
  const linked = useSearchParams().get('meeting');
  const [meetingId, setMeetingId] = useState(linked ?? meetings[0]?.id);
  const article = useRef<HTMLElement>(null);
  /** Whether this page added the step back to the list (phones only). */
  const stepped = useRef(false);
  // On a phone the list shows until a meeting is in the URL.
  const opened = linked !== null;
  const meeting =
    meetings.find((candidate) => candidate.id === meetingId) ?? meetings[0];

  if (!meeting) {
    return (
      <p className="rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
        {fathomConnected ? (
          <>
            No meetings with this client yet. Recordings Fathom couldn’t match
            to a client wait on the{' '}
            <TextLink href="/meetings">Meetings page</TextLink>, to attach by
            hand.
          </>
        ) : (
          <>
            No meetings yet.{' '}
            <TextLink href="/connections/fathom">Connect Fathom</TextLink> to
            bring in client calls.
          </>
        )}
      </p>
    );
  }

  const choose = (id: string) => {
    setMeetingId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('meeting', id);
    if (window.matchMedia('(width < 48rem)').matches) {
      window.history.pushState(null, '', url);
      stepped.current = true;
      requestAnimationFrame(() =>
        article.current?.scrollIntoView({ block: 'start' }),
      );
    } else {
      window.history.replaceState(null, '', url);
    }
  };

  /** Back to the list, on a phone. */
  const backToList = () => {
    if (stepped.current) {
      stepped.current = false;
      window.history.back();
      return;
    }
    // Opened from a link: there's no step to go back through.
    const url = new URL(window.location.href);
    url.searchParams.delete('meeting');
    window.history.replaceState(null, '', url);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Meetings" className={cn(opened && 'max-md:hidden')}>
        <ul className="flex flex-col gap-1 max-md:gap-1.5">
          {meetings.map((each) => (
            <li key={each.id}>
              <button
                type="button"
                aria-current={each.id === meeting.id ? 'true' : undefined}
                onClick={() => choose(each.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors max-md:press max-md:min-h-14 max-md:bg-grey-1 max-md:px-4 max-md:active:bg-grey-2',
                  each.id === meeting.id ? 'bg-grey-1' : 'hover:bg-grey-1/60',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-medium max-md:text-body">
                    {each.title}
                  </span>
                  <span className="mt-0.5 block text-[0.75rem] text-muted max-md:text-small">
                    {each.date} · {each.minutes} min
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted md:hidden"
                  strokeWidth={1.75}
                />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <article
        ref={article}
        aria-labelledby="meeting-title"
        className={cn('min-w-0', !opened && 'max-md:hidden')}
      >
        <button
          type="button"
          onClick={backToList}
          className="press -mt-1 mb-3 -ml-2 flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-small text-muted active:bg-grey-1 md:hidden"
        >
          <ChevronLeft aria-hidden className="size-5" strokeWidth={1.75} />
          All meetings
        </button>
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
