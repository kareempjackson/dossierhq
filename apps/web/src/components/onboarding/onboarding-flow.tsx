'use client';

import {
  TOOL_NAMES,
  type Invite,
  type Me,
  type Onboarding,
  type ReportSettings,
  type TwoFactorStatus,
} from '@dossierhq/contracts';
import { Check, LogOut } from 'lucide-react';
import { useState } from 'react';
import { signOut } from '@/app/auth-actions';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/format';
import { AboutYouStep } from './about-you-step';
import { BrandingStep } from './branding-step';
import { CompanyStep } from './company-step';
import { DoneStep, type SummaryLine } from './done-step';
import { SecurityStep } from './security-step';
import { TeamStep } from './team-step';
import { ToolsStep } from './tools-step';

const STEPS = {
  you: { label: 'About you', detail: 'Your name and role' },
  company: { label: 'Your company', detail: 'Name, size and time zone' },
  tools: { label: 'Your tools', detail: 'What Dossier reads from' },
  branding: { label: 'Client reports', detail: 'How they look' },
  security: { label: 'Two-factor sign-in', detail: 'Every account has it' },
  team: { label: 'Your team', detail: 'Invite colleagues' },
  done: { label: 'All set', detail: 'Into Dossier' },
} as const;

type StepId = keyof typeof STEPS;

/** Who goes through which steps. */
function stepsFor(me: Me): StepId[] {
  if (me.setup === 'two-factor') return ['security', 'done'];
  if (me.role === 'owner') {
    return ['you', 'company', 'tools', 'branding', 'security', 'team', 'done'];
  }
  return ['you', 'security', 'done'];
}

/**
 * Onboarding, one step at a time: what's asked is saved as each step is
 * left, so coming back (the step is in the URL) picks up where they were.
 */
export function OnboardingFlow({
  me,
  onboarding: saved,
  twoFactor,
  settings: savedSettings,
  invites: savedInvites,
  timeZones,
  initialStep,
}: {
  me: Me;
  onboarding: Onboarding;
  twoFactor: TwoFactorStatus;
  /** Owners only. */
  settings: ReportSettings | null;
  invites: Invite[];
  timeZones: string[];
  initialStep: string | undefined;
}) {
  const steps = stepsFor(me);
  const start = Math.max(0, steps.indexOf(initialStep as StepId));
  const [index, setIndex] = useState(start);
  const [furthest, setFurthest] = useState(start);
  const [onboarding, setOnboarding] = useState(saved);
  const [settings, setSettings] = useState(savedSettings);
  const [branded, setBranded] = useState(false);
  const [invites, setInvites] = useState(savedInvites);
  const [twoFactorOn, setTwoFactorOn] = useState(twoFactor.enabled);

  const step = steps[index]!;
  function go(to: number) {
    const target = steps[to];
    if (!target) return;
    setIndex(to);
    setFurthest((was) => Math.max(was, to));
    window.history.replaceState(null, '', `?step=${target}`);
    window.scrollTo({ top: 0 });
  }
  const next = () => go(index + 1);
  const back = index > 0 && step !== 'done' ? () => go(index - 1) : undefined;

  const { company, profile } = onboarding;
  const owner = steps.includes('company');
  const summary: SummaryLine[] = owner
    ? [
        {
          label: profile.title
            ? `${profile.name}, ${profile.title}`
            : profile.name,
          done: true,
        },
        { label: company.name, done: true },
        {
          label:
            company.tools.length > 0
              ? `Uses ${company.tools.map((tool) => TOOL_NAMES[tool]).join(', ')}`
              : 'No tools chosen yet',
          done: company.tools.length > 0,
        },
        {
          label: branded
            ? 'Report branding saved'
            : 'Report branding left as it is',
          done: branded,
        },
        {
          label: twoFactorOn
            ? 'Two-factor sign-in on'
            : 'Two-factor sign-in off',
          done: twoFactorOn,
        },
        {
          label:
            invites.length > 0
              ? `${plural(invites.length, 'invite')} sent`
              : 'No one invited yet',
          done: invites.length > 0,
        },
      ]
    : [
        ...(steps.includes('you')
          ? [
              {
                label: profile.title
                  ? `${profile.name}, ${profile.title}`
                  : profile.name,
                done: true,
              },
            ]
          : []),
        {
          label: twoFactorOn
            ? 'Two-factor sign-in on'
            : 'Two-factor sign-in off',
          done: twoFactorOn,
        },
      ];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
      <aside className="relative isolate overflow-hidden bg-night text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 -right-40 size-120 rounded-full bg-brand opacity-30 blur-[120px]" />
          <div className="absolute -bottom-48 -left-40 size-120 rounded-full bg-brand-deep opacity-80 blur-[120px]" />
        </div>

        <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-8 lg:pt-8">
          <p className="text-wordmark font-semibold">Dossier</p>
          <p className="text-meta text-white/65 lg:hidden">
            Step {index + 1} of {steps.length}
          </p>
        </div>

        {/* Narrow screens: a bar, and the step's name. */}
        <div className="px-5 pb-4 lg:hidden">
          <div
            aria-hidden
            className="h-1 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="h-full rounded-full bg-mint transition-[width] duration-500"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-meta font-medium">{STEPS[step].label}</p>
        </div>

        <div className="hidden px-8 pt-10 lg:block">
          <p className="text-meta font-medium text-mint">
            {me.setup === 'two-factor' ? 'Your account' : 'Setting up'}
          </p>
          <p className="mt-2 text-figure text-balance">{company.name}</p>
        </div>

        <nav aria-label="Setup steps" className="hidden px-5 pt-8 lg:block">
          <ol className="flex flex-col gap-1">
            {steps.map((id, at) => {
              const done = at < index || (at < furthest && at !== index);
              const reachable = at <= furthest && id !== 'done';
              const current = at === index;
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={!reachable || current}
                    onClick={() => go(at)}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-left transition-colors',
                      current && 'bg-white/10',
                      reachable && !current && 'hover:bg-white/5',
                      'disabled:cursor-default',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full font-mono text-mono tabular-nums transition-colors',
                        done
                          ? 'bg-mint text-night'
                          : current
                            ? 'bg-white text-night'
                            : 'bg-white/10 text-white/60',
                      )}
                    >
                      {done ? (
                        <Check
                          aria-hidden
                          className="size-3.5"
                          strokeWidth={3}
                        />
                      ) : (
                        at + 1
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block text-body font-medium',
                          current || done ? 'text-white' : 'text-white/60',
                        )}
                      >
                        <span className="sr-only">{done ? 'Done: ' : ''}</span>
                        {STEPS[id].label}
                      </span>
                      <span className="block truncate text-meta-sm text-white/50">
                        {STEPS[id].detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-auto hidden px-8 pt-8 pb-8 lg:block">
          <p className="truncate text-meta text-white/55">
            Signed in as {me.user.email}
          </p>
          <form action={signOut} className="mt-1">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-row text-meta text-white/80 transition-colors hover:text-white"
            >
              <LogOut aria-hidden className="size-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main id="main" className="px-4 py-8 sm:px-8 lg:px-16 lg:py-16">
        <div
          key={step}
          className={cn(
            'mx-auto w-full motion-safe:animate-enter',
            step === 'branding' ? 'max-w-3xl' : 'max-w-xl',
          )}
        >
          {step === 'you' && (
            <AboutYouStep
              next={next}
              back={back}
              profile={profile}
              welcome={
                owner ? 'Welcome to Dossier' : `Welcome to ${company.name}`
              }
              onSaved={(changed) =>
                setOnboarding((was) => ({ ...was, profile: changed }))
              }
            />
          )}
          {step === 'company' && (
            <CompanyStep
              next={next}
              back={back}
              company={company}
              suggestedWebsite={onboarding.suggestedWebsite}
              timeZones={timeZones}
              onSaved={setOnboarding}
            />
          )}
          {step === 'tools' && (
            <ToolsStep
              next={next}
              back={back}
              company={company}
              onSaved={setOnboarding}
            />
          )}
          {step === 'branding' && settings && (
            <BrandingStep
              next={next}
              back={back}
              settings={settings}
              companyName={company.name}
              email={me.user.email}
              onSaved={(changed) => {
                setSettings(changed);
                setBranded(true);
              }}
            />
          )}
          {step === 'security' && (
            <SecurityStep
              next={next}
              back={back}
              status={{ ...twoFactor, enabled: twoFactorOn }}
              email={me.user.email}
              again={me.setup === 'two-factor'}
              onEnabled={() => setTwoFactorOn(true)}
            />
          )}
          {step === 'team' && (
            <TeamStep
              next={next}
              back={back}
              invites={invites}
              onInvited={(invite) =>
                setInvites((was) => [
                  invite,
                  ...was.filter((i) => i.email !== invite.email),
                ])
              }
            />
          )}
          {step === 'done' && (
            <DoneStep
              back={() => go(index - 1)}
              firstName={profile.name.split(' ')[0] || profile.name}
              summary={summary}
              tool={company.tools[0] ?? null}
              canConnect={me.role !== 'technician'}
              onTwoFactorMissing={() => go(steps.indexOf('security'))}
            />
          )}

          <form action={signOut} className="mt-10 text-center lg:hidden">
            <p className="text-meta text-muted">Signed in as {me.user.email}</p>
            <button
              type="submit"
              className="mt-1 rounded-row text-meta font-medium text-ink underline decoration-border-strong underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
