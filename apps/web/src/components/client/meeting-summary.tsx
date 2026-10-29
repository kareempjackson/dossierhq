import type { CitedText, MeetingPoints, Source } from '@dossierhq/contracts';
import { cn } from '@/lib/cn';

const groups = [
  { key: 'planning', label: 'Planning' },
  { key: 'concerns', label: 'Concern' },
  { key: 'askedFor', label: 'Asked for' },
] as const;

/** Whether Dossier found anything the client said. */
export const hasPoints = (points: MeetingPoints) =>
  points.planning.length + points.concerns.length + points.askedFor.length > 0;

/**
 * What the client said in a meeting or in notes: plans, concerns and asks.
 * A point links to the moment in the recording it came from, or shows the
 * words in the notes it rests on.
 */
export function MeetingSummary({
  points,
  sourceById,
  className,
}: {
  points: MeetingPoints;
  sourceById: Map<string, Source>;
  className?: string;
}) {
  return (
    <dl className={cn('flex flex-col gap-3', className)}>
      {groups.map(({ key, label }) =>
        points[key].length > 0 ? (
          <div key={key}>
            <dt className="text-meta-sm font-medium text-muted">{label}</dt>
            <dd className="mt-1">
              <ul className="flex flex-col gap-1.5">
                {points[key].map((point) => (
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
      {source?.kind === 'note' && source.quote && (
        <span className="mt-0.5 block text-meta-sm text-muted">
          “{source.quote}”
        </span>
      )}
    </li>
  );
}
