import Link from 'next/link';
import { AskBox } from '@/components/ui/ask-box';
import { getAskHistory, getIntelligence } from '@/lib/data';
import { orEmpty, orNull } from '@/lib/data/safe';
import { askUnavailable } from '@/lib/intelligence';

/** How many recent questions show under the box. */
const RECENT = 3;

/**
 * The Ask box, off with a reason when Ask can't answer, and the last few
 * questions anyone here asked. Suspend it behind a plain <AskBox />, so the
 * box is there at once for the sidebar's link to jump to.
 */
export async function AskSection() {
  const [settings, recent] = await Promise.all([
    getIntelligence().catch(orNull),
    getAskHistory({ limit: RECENT }).catch(orEmpty),
  ]);

  return (
    <div>
      <AskBox unavailable={settings && askUnavailable(settings)} />
      {recent.length > 0 && (
        <nav aria-label="Recently asked" className="px-5">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta">
            <li className="text-muted">Recently asked</li>
            {recent.map((question) => (
              <li key={question.id} className="min-w-0">
                <Link
                  href={`/ask/${encodeURIComponent(question.id)}`}
                  className="block max-w-72 truncate text-text underline-offset-2 hover:text-ink hover:underline"
                >
                  {question.question}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/ask"
                className="text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                All questions
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
