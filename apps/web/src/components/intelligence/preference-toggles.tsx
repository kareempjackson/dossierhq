'use client';

import {
  INTELLIGENCE_OUTPUTS,
  INTELLIGENCE_RECORDS,
  INTELLIGENCE_TOPICS,
  type IntelligenceOutput,
  type IntelligencePreferences,
  type IntelligenceRecord,
  type IntelligenceTopic,
} from '@dossierhq/contracts';
import {
  BookOpen,
  CalendarClock,
  Compass,
  DatabaseBackup,
  FileQuestionMark,
  Folder,
  Handshake,
  LifeBuoy,
  Lightbulb,
  MessageCircleQuestionMark,
  MonitorCog,
  MonitorSmartphone,
  NotebookPen,
  RefreshCw,
  ShieldCheck,
  Ticket,
  Video,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, useTransition, type ReactNode } from 'react';
import {
  draftRecommendationsNow,
  findPatternsNow,
  setIntelligencePreferences,
} from '@/app/intelligence-actions';
import { Feedback, type Message } from '@/components/settings/setting-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';

const OUTPUT_ICONS = {
  recommendations: Lightbulb,
  reportQuestions: FileQuestionMark,
  meetingNotes: NotebookPen,
  ask: MessageCircleQuestionMark,
  patterns: Waypoints,
} satisfies Record<IntelligenceOutput, LucideIcon>;

const TOPIC_ICONS = {
  backups: DatabaseBackup,
  patching: RefreshCw,
  security: ShieldCheck,
  devices: MonitorCog,
  renewals: CalendarClock,
  promises: Handshake,
  helpdesk: LifeBuoy,
  plans: Compass,
} satisfies Record<IntelligenceTopic, LucideIcon>;

const RECORD_ICONS = {
  devices: MonitorSmartphone,
  tickets: Ticket,
  meetings: Video,
  documentation: BookOpen,
  files: Folder,
  notes: NotebookPen,
} satisfies Record<IntelligenceRecord, LucideIcon>;

const OUTPUTS = INTELLIGENCE_OUTPUTS.filter((output) => output.available);
const COMING_SOON = INTELLIGENCE_OUTPUTS.filter((output) => !output.available);

type GroupKey = keyof IntelligencePreferences;

/** "5 of 8 on". */
const tally = (values: Record<string, boolean>, ids: string[]) =>
  `${ids.filter((id) => values[id]).length} of ${ids.length} on`;

/**
 * What Dossier drafts with Claude, what it looks for, and which records Claude
 * may read. Each switch saves at once; only owners and admins can change them.
 */
export function PreferenceToggles({
  preferences,
  canManage,
  enabled,
}: {
  preferences: IntelligencePreferences;
  canManage: boolean;
  /** Whether the API can draft at all (it has an Anthropic key). */
  enabled: boolean;
}) {
  const [current, setCurrent] = useState(preferences);
  const [message, setMessage] = useState<
    (Message & { at: GroupKey | 'draft' | 'patterns' }) | null
  >(null);
  const [changed, setChanged] = useState<GroupKey | null>(null);
  const [saving, startSaving] = useTransition();
  const [drafting, startDrafting] = useTransition();
  const [looking, startLooking] = useTransition();

  function change(group: GroupKey, key: string, value: boolean) {
    const previous = current;
    const next = { ...current, [group]: { ...current[group], [key]: value } };
    setCurrent(next);
    setChanged(group);
    setMessage(null);
    startSaving(async () => {
      const result = await setIntelligencePreferences(next);
      if (!result.ok) {
        setCurrent(previous);
        setMessage({ at: group, text: result.error, failed: true });
      }
    });
  }

  function draftNow() {
    setMessage(null);
    startDrafting(async () => {
      const result = await draftRecommendationsNow();
      setMessage(
        result.ok
          ? {
              at: 'draft',
              text: 'Drafting has started. New recommendations appear on each client within a few minutes.',
              failed: false,
            }
          : { at: 'draft', text: result.error, failed: true },
      );
    });
  }

  function lookNow() {
    setMessage(null);
    startLooking(async () => {
      const result = await findPatternsNow();
      setMessage(
        result.ok
          ? {
              at: 'patterns',
              text: 'Dossier is looking. Patterns it finds appear on Home within a few minutes.',
              failed: false,
            }
          : { at: 'patterns', text: result.error, failed: true },
      );
    });
  }

  const locked = !canManage;
  const recommending = current.outputs.recommendations;
  const feedback = (at: GroupKey | 'draft' | 'patterns') => (
    <Feedback message={message?.at === at ? message : null} />
  );
  const status = (group: GroupKey, ids: string[]) =>
    saving && changed === group ? 'Saving…' : tally(current[group], ids);

  return (
    <div className="flex flex-col gap-14">
      <SettingsSection
        id="outputs"
        title="What Dossier drafts"
        description="Turning one off stops that work, and what it costs."
        aside={status(
          'outputs',
          OUTPUTS.map((output) => output.id),
        )}
      >
        <ListCard>
          {OUTPUTS.map((output) => (
            <Toggle
              key={output.id}
              icon={OUTPUT_ICONS[output.id]}
              name={output.name}
              description={output.description}
              checked={current.outputs[output.id]}
              disabled={locked}
              onChange={(value) => change('outputs', output.id, value)}
              className="px-5 py-4"
            >
              {output.id === 'recommendations' && canManage && recommending && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={draftNow}
                    disabled={!enabled || saving || drafting}
                  >
                    <RefreshCw aria-hidden strokeWidth={1.75} />
                    {drafting ? 'Starting…' : 'Draft recommendations now'}
                  </Button>
                  {feedback('draft')}
                </div>
              )}
              {output.id === 'patterns' &&
                canManage &&
                current.outputs.patterns && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      onClick={lookNow}
                      disabled={!enabled || saving || looking}
                    >
                      <RefreshCw aria-hidden strokeWidth={1.75} />
                      {looking ? 'Starting…' : 'Look for patterns now'}
                    </Button>
                    {feedback('patterns')}
                  </div>
                )}
            </Toggle>
          ))}
        </ListCard>
        {feedback('outputs')}

        {COMING_SOON.length > 0 && (
          <div className="@container">
            <h3 className="text-meta font-medium text-muted">Coming soon</h3>
            <ul className="mt-3 grid gap-3 @2xl:grid-cols-3">
              {COMING_SOON.map((output) => {
                const Icon = OUTPUT_ICONS[output.id];
                return (
                  <li
                    key={output.id}
                    className="flex gap-3 rounded-card bg-surface-soft p-4 ring-1 ring-hairline ring-inset @2xl:flex-col"
                  >
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-tile bg-sheet text-muted shadow-card"
                    >
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-body font-medium text-ink">
                        {output.name}
                      </p>
                      <p className="mt-0.5 text-meta text-muted">
                        {output.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="topics"
        title="What to look for"
        description={
          recommending
            ? 'Recommendations only cover the topics that are on.'
            : 'These shape recommendations, which are off.'
        }
        aside={status(
          'topics',
          INTELLIGENCE_TOPICS.map((topic) => topic.id),
        )}
      >
        {/* Two columns once a tile has room for its description. */}
        <div className="@container">
          <ul className="grid gap-3 @xl:grid-cols-2">
            {INTELLIGENCE_TOPICS.map((topic) => (
              <Toggle
                key={topic.id}
                icon={TOPIC_ICONS[topic.id]}
                name={topic.name}
                description={capitalise(topic.description)}
                checked={current.topics[topic.id]}
                disabled={locked}
                onChange={(value) => change('topics', topic.id, value)}
                className="rounded-card bg-sheet p-4 shadow-card"
              />
            ))}
          </ul>
        </div>
        {feedback('topics')}
      </SettingsSection>

      <SettingsSection
        id="records"
        title="What Claude may read"
        description="Records that are off are never sent to Anthropic."
        aside={status(
          'records',
          INTELLIGENCE_RECORDS.map((record) => record.id),
        )}
      >
        <ListCard>
          {INTELLIGENCE_RECORDS.map((record) => (
            <Toggle
              key={record.id}
              icon={RECORD_ICONS[record.id]}
              name={record.name}
              badge={<Pill tone="quiet">{record.from}</Pill>}
              description={record.description}
              checked={current.records[record.id]}
              disabled={locked}
              onChange={(value) => change('records', record.id, value)}
              className="px-5 py-4"
            />
          ))}
        </ListCard>
        {feedback('records')}
      </SettingsSection>
    </div>
  );
}

/**
 * One switch with what it does. Its icon takes the brand colour while it's
 * on, so a list shows at a glance what is.
 */
function Toggle({
  icon: Icon,
  name,
  badge,
  description,
  checked,
  disabled,
  onChange,
  className,
  children,
}: {
  icon: LucideIcon;
  name: string;
  /** A Pill beside the name; the switch's name includes it. */
  badge?: ReactNode;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  className: string;
  children?: ReactNode;
}) {
  const ids = { name: useId(), description: useId() };
  return (
    <li className={cn('flex gap-4', className)}>
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-tile transition-colors',
          checked ? 'bg-brand-soft text-brand-deep' : 'bg-surface text-muted',
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <h3
          id={ids.name}
          className="flex flex-wrap items-center gap-2 text-body font-medium text-ink"
        >
          {name}
          {badge}
        </h3>
        <p id={ids.description} className="mt-0.5 text-meta text-muted">
          {description}
        </p>
        {children}
      </div>
      {/* Level with the middle of the icon. */}
      <div className="mt-1.5">
        <Switch
          checked={checked}
          disabled={disabled}
          labelledBy={ids.name}
          describedBy={ids.description}
          onChange={onChange}
        />
      </div>
    </li>
  );
}

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
