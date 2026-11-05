import type {
  CitedText,
  PersonProfile,
  Source,
  ToneTrend,
  WritingStyle,
} from '@dossierhq/contracts';
import {
  CopyForClient,
  ExecutiveBriefView,
} from '@/components/ui/executive-brief';
import { Panel } from '@/components/ui/panel';
import { Pill } from '@/components/ui/pill';
import { Styled, StyleSwitch } from '@/components/ui/style-switch';
import { getSources } from '@/lib/data';
import { orEmpty } from '@/lib/data/safe';
import { sourceTools } from '@/lib/sources';

const TONE: Record<ToneTrend, string> = {
  improving: 'Sounding better lately',
  steady: 'Sounding steady',
  worsening: 'Sounding worse lately',
  unknown: 'Tone unclear',
};

/**
 * What Dossier read about a person, from their tickets, devices and what
 * they said in meetings: in the team's words, or the client's leadership's.
 */
export async function PersonProfilePanel({
  profile,
  style,
}: {
  profile: PersonProfile;
  style: WritingStyle;
}) {
  const lines = [
    ...profile.recurring,
    ...profile.devices,
    ...profile.openLoops,
  ];
  const sources = await getSources([
    ...new Set(lines.flatMap((line) => line.sourceIds)),
  ]).catch(orEmpty);
  const byId = new Map(sources.map((s) => [s.id, s]));
  return (
    <Panel
      id="profile-heading"
      as="h3"
      title="Dossier’s read"
      note={<StyleSwitch initial={style} />}
    >
      <Styled
        initial={style}
        technical={
          <div className="flex flex-col gap-3 text-meta">
            <p className="text-text">{profile.summary}</p>
            <Lines
              title="Keeps coming back"
              lines={profile.recurring}
              byId={byId}
            />
            <Lines title="Their devices" lines={profile.devices} byId={byId} />
            <Lines title="Still open" lines={profile.openLoops} byId={byId} />
            <p className="flex flex-wrap items-center gap-1.5">
              <Pill tone="quiet">{TONE[profile.tone.trend]}</Pill>
              {profile.tone.note && (
                <span className="text-meta-sm text-muted">
                  {profile.tone.note}
                </span>
              )}
            </p>
          </div>
        }
        executive={
          profile.executive ? (
            <div className="flex flex-col gap-3">
              <ExecutiveBriefView
                brief={profile.executive}
                as="p"
                className="text-meta"
              />
              <CopyForClient brief={profile.executive} className="-ml-3" />
            </div>
          ) : (
            <p className="text-meta text-muted">
              No version for the client: what Dossier could say rests on
              internal notes.
            </p>
          )
        }
      />
    </Panel>
  );
}

function Lines({
  title,
  lines,
  byId,
}: {
  title: string;
  lines: CitedText[];
  byId: Map<string, Source>;
}) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="text-meta-sm font-medium text-muted">{title}</p>
      <ul className="mt-1 flex flex-col gap-1 text-text">
        {lines.map((line, index) => {
          const cited = line.sourceIds.flatMap((id) => byId.get(id) ?? []);
          return (
            <li key={index}>
              {line.text}
              {cited.length > 0 && (
                <span className="ml-1.5 font-mono text-mono text-muted">
                  {sourceTools(cited)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
