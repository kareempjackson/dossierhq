import type { BriefView } from '@/lib/client-views';

/** An executive version: the point, a few short lines, the decision asked. */
export function Brief({ brief }: { brief: BriefView }) {
  return (
    <>
      <p className="mt-2 font-display text-h3">{brief.headline}</p>
      {brief.points.length > 0 && (
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-small">
          {brief.points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      )}
      {brief.decision && (
        <p className="mt-3 text-small">
          <span className="font-medium">Decision needed: </span>
          {brief.decision}
        </p>
      )}
    </>
  );
}
