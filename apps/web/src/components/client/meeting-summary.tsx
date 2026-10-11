import type { CitedText, Meeting, Source } from '@dossierhq/contracts';
import { cn } from '@/lib/cn';

const groups = [
  { key: 'planning', label: 'Planning' },
  { key: 'concerns', label: 'Concern' },
  { key: 'askedFor', label: 'Asked for' },
] as const;

/**
 * What the client said in a meeting: plans, concerns and asks. Each point
 * links to the moment in the recording it came from.
 */
export function MeetingSummary({
  meeting,
  sourceById,
  className,
}: {
  meeting: Meeting;
  sourceById: Map<string, Source>;
  className?: string;
}) {
  return (
    <dl className={cn('flex flex-col gap-3', className)}>
      {groups.map(({ key, label }) =>
        meeting[key].length > 0 ? (
          <div key={key}>
            <dt className="text-meta-sm font-medium text-muted">{label}</dt>
            <dd className="mt-1">
              <ul className="flex flex-col gap-1.5">
                {meeting[key].map((point) => (
                  <Point
                    key={point.text}
                    point={point}
                    sourceById={sourceById}
                  />
                ))}
              </ul>
            </dd>
          </div>
        ) : null,
      )}
    </dl>
  );
}

function Point({
  point,
  sourceById,
}: {
  point: CitedText;
  sourceById: Map<string, Source>;
}) {
  const source = sourceById.get(point.sourceIds[0] ?? '');
  return (
    <li className="text-meta text-ink">
      {point.text}
      {source?.kind === 'meeting' && (
        <>
          {' '}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open in Fathom at ${source.transcriptAt}`}
            className="rounded-row font-mono text-mono whitespace-nowrap text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {source.transcriptAt}
          </a>
        </>
      )}
    </li>
  );
}
