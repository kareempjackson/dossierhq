import { TOOL_NAMES, type Tool } from '@dossierhq/contracts';
import { ButtonLink } from '@/components/ui/button';
import { ConnectorTile } from '@/components/ui/connector-tile';
import { getMe, getNow, getWorkspace } from '@/lib/data';
import { orNull } from '@/lib/data/safe';
import { formatLongDay } from '@/lib/format';

const STEPS: { tools: Tool[]; gives: string }[] = [
  {
    tools: ['ninjaone', 'hudu'],
    gives:
      'Bring in your clients, with their devices, alerts, patching and what’s about to expire.',
  },
  { tools: ['sharepoint'], gives: 'Adds the files in each client’s folder.' },
  {
    tools: ['fathom'],
    gives: 'Adds client meetings and the follow-ups you promised in them.',
  },
];

/** Home before any tool is connected: what to do first, and why. */
export async function GetStarted() {
  const [workspace, now, me] = await Promise.all([
    getWorkspace(),
    getNow(),
    getMe().catch(orNull),
  ]);
  const firstName = me?.user.name.split(' ')[0];

  return (
    <>
      <header>
        <p className="text-meta text-muted">
          {formatLongDay(now, workspace.timeZone)}
        </p>
        <h1 className="mt-2 text-title-compact sm:text-title">
          {firstName ? `Welcome, ${firstName}. ` : ''}Connect your tools to get
          started.
        </h1>
        <p className="mt-3 max-w-2xl text-text">
          Dossier reads from the tools you already use and shows what needs
          attention at each client, with the record behind every line. It only
          ever reads.
        </p>
      </header>

      <section aria-labelledby="get-started-heading">
        <h2 id="get-started-heading" className="sr-only">
          What each tool adds
        </h2>
        <ol className="divide-y divide-hairline rounded-card bg-sheet shadow-card">
          {STEPS.map((step, index) => (
            <li key={step.gives} className="flex gap-4 px-4 py-4">
              <span className="mt-0.5 w-5 shrink-0 text-meta text-muted tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  {step.tools.map((tool, i) => (
                    <span key={tool} className="flex items-center gap-2">
                      {i > 0 && (
                        <span className="font-normal text-muted">or</span>
                      )}
                      <ConnectorTile tool={tool} size="sm" />
                      {TOOL_NAMES[tool]}
                    </span>
                  ))}
                </p>
                <p className="mt-1 text-meta text-text">{step.gives}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <ButtonLink variant="primary" href="/connections">
            Connect your tools
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
