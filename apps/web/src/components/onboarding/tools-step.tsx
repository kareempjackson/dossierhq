'use client';

import { TOOL_NAMES, type Onboarding, type Tool } from '@dossierhq/contracts';
import { Check } from 'lucide-react';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { saveCompany } from '@/app/onboarding-actions';
import { Button } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { cn } from '@/lib/cn';
import {
  fieldClass,
  labelClass,
  StepError,
  StepFooter,
  StepHeader,
  type StepProps,
} from './step-parts';

/** What Dossier reads from each, in a line. */
const READS: Record<Tool, string> = {
  ninjaone: 'Devices, alerts, patching and tickets',
  hudu: 'Companies, assets, websites and what expires',
  sharepoint: 'Each client’s folder of documents',
  fathom: 'Client meetings, summaries and action items',
};

const TOOLS: Tool[] = ['ninjaone', 'hudu', 'sharepoint', 'fathom'];

export function ToolsStep({
  next,
  back,
  company,
  onSaved,
}: StepProps & {
  company: Onboarding['company'];
  onSaved: (onboarding: Onboarding) => void;
}) {
  const id = useId();
  const [tools, setTools] = useState<Tool[]>(company.tools);
  const [otherTools, setOtherTools] = useState(company.otherTools);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (tool: Tool) =>
    setTools((chosen) =>
      chosen.includes(tool)
        ? chosen.filter((t) => t !== tool)
        : TOOLS.filter((t) => t === tool || chosen.includes(t)),
    );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveCompany({ tools, otherTools });
      if (!result.ok) return setError(result.error);
      onSaved(result.onboarding);
      next();
    });
  }

  return (
    <form onSubmit={submit}>
      <StepHeader eyebrow="Your tools" title="Which tools do you use?">
        Dossier reads from these to show what needs attention at each client.
        You’ll connect them once setup is done. Dossier only ever reads; it
        never changes anything in them.
      </StepHeader>

      <div
        role="group"
        aria-label="Tools Dossier reads from"
        className="mt-8 grid gap-3 sm:grid-cols-2"
      >
        {TOOLS.map((tool) => {
          const chosen = tools.includes(tool);
          return (
            <button
              key={tool}
              type="button"
              aria-pressed={chosen}
              onClick={() => toggle(tool)}
              className={cn(
                'group relative flex items-start gap-3 rounded-tile p-4 text-left ring-1 transition-[box-shadow,background-color] ring-inset',
                chosen
                  ? 'bg-brand-soft ring-2 ring-brand'
                  : 'bg-sheet ring-hairline hover:bg-surface-soft hover:shadow-card',
              )}
            >
              <ConnectorTile tool={tool} />
              <span className="min-w-0 flex-1">
                <span className="block text-section font-semibold text-ink">
                  {TOOL_NAMES[tool]}
                </span>
                <span className="mt-0.5 block text-meta text-muted">
                  {READS[tool]}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full transition-colors',
                  chosen
                    ? 'bg-brand text-white'
                    : 'bg-surface text-transparent',
                )}
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-1.5">
        <label htmlFor={`${id}-other`} className={labelClass}>
          Anything else you use?{' '}
          <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={`${id}-other`}
          value={otherTools}
          onChange={(event) => setOtherTools(event.target.value)}
          maxLength={200}
          placeholder="ConnectWise, Autotask, IT Glue…"
          className={fieldClass}
        />
        <p className="text-meta-sm text-muted">
          It helps us decide what Dossier reads from next.
        </p>
      </div>

      <div className="mt-6">
        <StepError message={error} />
      </div>

      <StepFooter back={back}>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending
            ? 'Saving…'
            : tools.length === 0 && !otherTools
              ? 'Skip for now'
              : 'Continue'}
        </Button>
      </StepFooter>
    </form>
  );
}
