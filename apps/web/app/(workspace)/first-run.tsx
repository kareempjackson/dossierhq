import Image, { type StaticImageData } from 'next/image';
import { FirstName } from '@/components/shell/first-name';
import { TopBar } from '@/components/shell/top-bar';
import { ButtonLink } from '@/components/ui/button';
import { Folder, type FolderTone } from '@/components/ui/folder';
import cabinet from '@/public/illustrations/10-original-cabinet 1.png';
import files from '@/public/illustrations/17-brain-of-files 1.png';
// Stand-in until the Fathom illustration (speech bubbles over a page) is in.
import fathom from '@/public/illustrations/18-model-cards 1.png';

type Step = {
  tone: FolderTone;
  title: string;
  body: string;
  illustration: StaticImageData;
  /**
   * The artwork sits off-centre in its canvas, so each is sized by height
   * and shifted by its visible centre (from its transparent margins).
   */
  illustrationClassName: string;
};

const STEPS: Step[] = [
  {
    tone: 'act',
    title: 'NinjaOne or Hudu',
    body: 'Brings in your clients, with devices, alerts, patching and what’s about to expire.',
    illustration: cabinet,
    illustrationClassName: 'h-44 -translate-x-[54.7%] -translate-y-[52%]',
  },
  {
    tone: 'calm',
    title: 'SharePoint',
    body: 'Adds the files in each client’s folder. Names only, never contents.',
    illustration: files,
    illustrationClassName: 'h-56 -translate-x-[61.9%] -translate-y-[62.2%]',
  },
  {
    tone: 'drafted',
    title: 'Fathom',
    body: 'Adds client meetings and the follow-ups you promised in them.',
    illustration: fathom,
    illustrationClassName: 'h-48 -translate-x-[47.3%] -translate-y-[53.2%]',
  },
];

/** Home before anything is connected: what to connect, in order. */
export function FirstRun() {
  return (
    <>
      <TopBar title="Home" />
      <section className="mt-10">
        <h1 className="text-h1">
          Welcome
          <FirstName />.
          <br />
          Connect your tools to get started.
        </h1>
        <p className="mt-5 max-w-2xl text-muted">
          Dossier reads from the tools you already use and shows what needs
          attention at each client, with the record behind every line. It only
          ever reads.
        </p>

        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Folder
                tone={step.tone}
                tab={`Step ${index + 1}`}
                padded={false}
                bodyClassName="flex h-full flex-col overflow-hidden md:min-h-[22rem]"
              >
                <div className="p-4 pb-8">
                  <h2 className="text-h3">{step.title}</h2>
                  <p className="mt-2 text-small text-muted">{step.body}</p>
                </div>
                <div className="relative mt-auto h-48 overflow-hidden rounded-t-2xl bg-white">
                  <Image
                    src={step.illustration}
                    alt=""
                    sizes="16rem"
                    className={`pointer-events-none absolute top-1/2 left-1/2 w-auto max-w-none ${step.illustrationClassName}`}
                  />
                </div>
              </Folder>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
          <ButtonLink href="/connections" variant="act">
            Connect your tools
          </ButtonLink>
          <p className="text-small text-muted">
            Takes about 5 minutes. Keys are encrypted and never shown again.
          </p>
        </div>
      </section>
    </>
  );
}
