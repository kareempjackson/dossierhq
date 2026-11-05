import type { ClientTheme, ThemeTrend } from '@dossierhq/contracts';
import {
  CopyForClient,
  ExecutiveBriefView,
} from '@/components/ui/executive-brief';
import { Pill } from '@/components/ui/pill';
import { SectionHeader } from '@/components/ui/section-header';
import { Styled, StyleSwitch } from '@/components/ui/style-switch';
import { getThemes } from '@/lib/data';
import { orEmpty } from '@/lib/data/safe';
import { formatCalendarDate } from '@/lib/format';
import { readingStyle } from '@/lib/writing-style';

const TRENDS: Record<ThemeTrend, string> = {
  new: 'New',
  growing: 'Growing',
  steady: 'Steady',
  fading: 'Fading',
};

const headingId = 'recurring-issues-heading';

/**
 * Trouble that keeps coming back at the client, found in what was read off
 * its tickets. Nothing shows until there's some.
 */
export async function RecurringIssuesSection({
  clientId,
}: {
  clientId: string;
}) {
  const [themes, style] = await Promise.all([
    getThemes(clientId).catch(orEmpty),
    readingStyle(),
  ]);
  if (themes.length === 0) return null;
  return (
    <section aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="Recurring issues"
        count={themes.length}
        note={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            From the last 90 days of tickets
            <StyleSwitch initial={style} />
          </span>
        }
      />
      <ul className="mt-3 flex flex-col gap-3">
        {themes.map((theme) => (
          <li key={theme.id} className="rounded-card bg-sheet p-4 shadow-card">
            <Styled
              initial={style}
              technical={<Technical theme={theme} />}
              executive={
                theme.executive ? (
                  <div className="flex flex-col gap-3">
                    <ExecutiveBriefView brief={theme.executive} />
                    <CopyForClient brief={theme.executive} className="-ml-3" />
                  </div>
                ) : (
                  <>
                    <h3 className="font-medium">{theme.title}</h3>
                    <p className="mt-1.5 text-meta text-muted">
                      No version for the client: what Dossier could say rests on
                      internal notes.
                    </p>
                  </>
                )
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Technical({ theme }: { theme: ClientTheme }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">{theme.title}</h3>
        <Pill tone={theme.trend === 'growing' ? 'neutral' : 'quiet'}>
          {TRENDS[theme.trend]}
        </Pill>
      </div>
      <p className="mt-1.5 text-meta text-text">{theme.summary}</p>
      <p className="mt-2 text-meta-sm text-muted">
        {theme.ticketIds.length} tickets,{' '}
        {formatCalendarDate(theme.firstSeen.slice(0, 10))} to{' '}
        {formatCalendarDate(theme.lastSeen.slice(0, 10))}
      </p>
    </>
  );
}
