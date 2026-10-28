'use client';

import {
  INTELLIGENCE_OUTPUTS,
  INTELLIGENCE_RECORDS,
  INTELLIGENCE_TOPICS,
  type IntelligencePreferences,
} from '@dossierhq/contracts';
import { useId, useState, useTransition, type ReactNode } from 'react';
import {
  draftRecommendationsNow,
  setIntelligencePreferences,
} from '@/app/intelligence-actions';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { Switch } from '@/components/ui/switch';

type GroupKey = keyof IntelligencePreferences;

/**
 * What Dossier drafts with Claude, what it looks for, and which records Claude
 * may read. Each switch saves at once; only the owner can change them.
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [drafting, startDrafting] = useTransition();

  function change(group: GroupKey, key: string, value: boolean) {
    const previous = current;
    const next = { ...current, [group]: { ...current[group], [key]: value } };
    setCurrent(next);
    setError(null);
    setNotice(null);
    startSaving(async () => {
      const result = await setIntelligencePreferences(next);
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error);
      }
    });
  }

  function draftNow() {
    setError(null);
    setNotice(null);
    startDrafting(async () => {
      const result = await draftRecommendationsNow();
      if (!result.ok) setError(result.error);
      else {
        setNotice(
          'Drafting has started. New recommendations appear on each client within a few minutes.',
        );
      }
    });
  }

  const locked = !canManage;
  const recommending = current.outputs.recommendations;

  return (
    <div className="flex flex-col gap-12">
      {(error || notice || locked) && (
        <div className="flex flex-col gap-1">
          {locked && (
            <p className="text-meta text-muted">
              Only the workspace owner can change these.
            </p>
          )}
          {error && (
            <p role="alert" className="text-meta text-alert">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-meta text-text">
              {notice}
            </p>
          )}
        </div>
      )}

      <Group
        id="outputs"
        title="What Dossier drafts"
        note="Turning one off stops that work, and what it costs."
      >
        {INTELLIGENCE_OUTPUTS.map((output) => (
          <Row
            key={output.id}
            name={output.name}
            description={output.description}
            badge={output.available ? undefined : 'Coming soon'}
            checked={output.available && current.outputs[output.id]}
            disabled={locked || !output.available}
            onChange={(value) => change('outputs', output.id, value)}
          >
            {output.id === 'recommendations' && canManage && (
              <Button
                onClick={draftNow}
                disabled={!enabled || !recommending || saving || drafting}
                className="mt-2 h-8 self-start px-3 text-meta"
              >
                {drafting ? 'Starting…' : 'Draft recommendations now'}
              </Button>
            )}
          </Row>
        ))}
      </Group>

      <Group
        id="topics"
        title="What to look for"
        note={
          recommending
            ? 'Recommendations only cover the topics that are on.'
            : 'These shape recommendations, which are off.'
        }
      >
        {INTELLIGENCE_TOPICS.map((topic) => (
          <Row
            key={topic.id}
            name={topic.name}
            description={capitalise(topic.description)}
            checked={current.topics[topic.id]}
            disabled={locked}
            onChange={(value) => change('topics', topic.id, value)}
          />
        ))}
      </Group>

      <Group
        id="records"
        title="What Claude may read"
        note="Records that are off are never sent to Anthropic."
      >
        {INTELLIGENCE_RECORDS.map((record) => (
          <Row
            key={record.id}
            name={record.name}
            badge={record.from}
            description={record.description}
            checked={current.records[record.id]}
            disabled={locked}
            onChange={(value) => change('records', record.id, value)}
          />
        ))}
      </Group>
    </div>
  );
}

function Group({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <SectionHeader id={id} title={title} note={note} />
      <ul className="flex flex-col divide-y divide-hairline rounded-card bg-sheet shadow-card">
        {children}
      </ul>
    </section>
  );
}

function Row({
  name,
  description,
  badge,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  description: string;
  badge?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  const ids = { name: useId(), description: useId() };
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          id={ids.name}
          className="flex flex-wrap items-center gap-2 text-body font-medium text-ink"
        >
          {name}
          {badge && (
            <span className="rounded-full bg-surface px-2 text-meta-sm font-normal text-muted">
              {badge}
            </span>
          )}
        </span>
        <span id={ids.description} className="text-meta text-muted">
          {description}
        </span>
        {children}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        labelledBy={ids.name}
        describedBy={ids.description}
        onChange={onChange}
      />
    </li>
  );
}

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
