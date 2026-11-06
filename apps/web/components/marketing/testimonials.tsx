'use client';

import { useId, useState } from 'react';
import { IndexPattern } from '@/components/brand/index-pattern';
import { ButtonLink } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * PLACEHOLDER QUOTES from the mock. These people and numbers are made up.
 * Replace them with real customers' words, used with their permission,
 * before this page goes public.
 */
const STORIES = [
  {
    name: 'Ama Mensah',
    role: 'Service lead, Northgate IT · 40 clients',
    quote:
      'We stopped digging through four tools before every client call. The file is just there, and every line shows where it came from.',
    stat: ['Morning prep', '45 → 5 min'],
    story: 'Northgate',
  },
  {
    name: 'Kofi Boateng',
    role: 'Founder, Boateng Systems · 18 clients',
    quote:
      'Renewals used to surprise us. Now they turn up a month ahead, with the record that says when.',
    stat: ['Missed renewals', '6 → 0'],
    story: 'Boateng Systems',
  },
  {
    name: 'Sarah Okafor',
    role: 'Practice manager, Harbour Dental',
    quote:
      'The weekly report answers the questions I used to email about. And it says where each answer came from.',
    stat: ['Status emails', 'Weekly → none'],
    story: 'Harbour Dental',
  },
  {
    name: 'Tom Reed',
    role: 'Senior technician, Ghost Savvy IT',
    quote:
      'It only reads. That’s why I let it near our tools, and why I check the audit log less than I thought I would.',
    stat: ['Tools connected', '4 in 5 min'],
    story: 'Ghost Savvy',
  },
];

export function Testimonials() {
  const [current, setCurrent] = useState(0);
  const id = useId();
  const story = STORIES[current];
  return (
    <div>
      <div
        role="tablist"
        aria-label="Customers"
        className="flex flex-wrap gap-1.5"
      >
        {STORIES.map((each, index) => (
          <button
            key={each.name}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={index === current}
            aria-controls={`${id}-panel`}
            onClick={() => setCurrent(index)}
            onKeyDown={(event) => {
              const step =
                event.key === 'ArrowRight'
                  ? 1
                  : event.key === 'ArrowLeft'
                    ? -1
                    : 0;
              if (!step) return;
              const next = (current + step + STORIES.length) % STORIES.length;
              setCurrent(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
            tabIndex={index === current ? 0 : -1}
            className={cn(
              'rounded-t-xl px-4 py-2 text-small transition-colors',
              index === current
                ? 'bg-grey-2 text-ink'
                : 'bg-grey-1 text-muted hover:text-ink',
            )}
          >
            {each.name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${current}`}
        className="grid gap-8 rounded-3xl rounded-tl-none bg-grey-2 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_26rem]"
      >
        <figure className="flex flex-col">
          <blockquote className="font-display text-h2 sm:text-[2.125rem] sm:leading-tight">
            “{story.quote}”
          </blockquote>
          <figcaption className="mt-6">
            <p className="text-small font-medium">{story.name}</p>
            <p className="text-[0.75rem] text-muted">{story.role}</p>
          </figcaption>
          <ButtonLink
            href="/customers"
            variant="ink"
            size="sm"
            className="mt-8 self-start lg:mt-auto"
          >
            Read {story.story}’s story
          </ButtonLink>
        </figure>
        <div className="relative isolate flex aspect-[4/3] items-end overflow-hidden rounded-2xl bg-deep p-4 lg:aspect-auto lg:min-h-72">
          <IndexPattern
            rows={5}
            cols={6}
            accents={[
              [1, 4],
              [3, 1],
            ]}
            accentClassName="text-lime"
            className="absolute inset-0 -z-10 h-full w-full text-paper/10"
          />
          <p className="rounded-xl bg-white px-3 py-2 text-[0.6875rem] text-muted">
            {story.stat[0]}
            <span className="ml-3 font-display text-base text-ink">
              {story.stat[1]}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
