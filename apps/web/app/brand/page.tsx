import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IndexPattern } from '@/components/brand/index-pattern';
import { Logo, Mark } from '@/components/brand/logo';
import { Button, MarkButton } from '@/components/ui/button';
import { CitedStack } from '@/components/ui/cited-stack';
import { Folder, type FolderTone } from '@/components/ui/folder';
import { IndexLoader } from '@/components/ui/index-loader';
import { Tag, type TagTone } from '@/components/ui/tag';
import { cn } from '@/lib/cn';

export const metadata: Metadata = {
  title: 'Brand',
  description: 'The Dossier brand guide: logo, colour, type and components.',
};

const SECTIONS = [
  ['logo', 'Logo'],
  ['colour', 'Colour'],
  ['type', 'Typography'],
  ['buttons', 'Buttons'],
  ['tags', 'Tags'],
  ['sheets', 'Tabs and sheets'],
  ['folders', 'Folders'],
  ['pattern', 'Pattern'],
  ['states', 'States'],
  ['voice', 'Voice'],
] as const;

export default function BrandPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-24 sm:px-8 lg:pt-16">
      <header>
        <Logo height={28} />
        <p className="mt-14 text-small text-muted">
          Brand guide v1.0 · Dashboard system v3
        </p>
        <h1 className="mt-3 text-h1 sm:text-display">
          White, grey, and on file.
        </h1>
        <p className="mt-6 max-w-2xl text-base text-muted">
          A calm white canvas with most lines dropped. Surfaces separate with
          four warm greys instead of strokes. Folder tabs, client folders and
          the cited-file stack carry the paper story. Lime marks the one action
          that matters; lilac marks anything Dossier drafted.
        </p>
        <nav aria-label="Sections" className="mt-8 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full bg-grey-1 px-3 py-1 text-small text-muted transition-colors hover:bg-grey-2 hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>
        <dl className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              'One file',
              'Everything about a client in one place, ready before the call.',
            ],
            [
              'What matters',
              'The three things that need attention today, not every alert.',
            ],
            [
              'The record',
              'Every line cites its source, so it can be checked.',
            ],
            [
              'Only reads',
              'Nothing in your tools is created, changed or deleted.',
            ],
          ].map(([title, body], index) => (
            <div key={title} className="rounded-2xl bg-grey-1 p-5">
              <dt className="flex items-baseline gap-3">
                <span className="font-mono text-label text-muted">
                  0{index + 1}
                </span>
                <span className="font-display text-h3">{title}</span>
              </dt>
              <dd className="mt-2 text-small text-muted">{body}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Section
        id="logo"
        title="Logo"
        intro="The mark is half a file seen from its spine: a tab on top, pages curling open. It faces left and opens toward whatever follows it. The lockup is one flattened piece; never rebuild it."
      >
        <Block label="Colour versions · ink on light, paper on dark, lime mark only on deep or night">
          <div className="grid gap-3 rounded-3xl bg-grey-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <LogoTile className="bg-paper text-ink" />
            <LogoTile className="bg-white text-ink" />
            <LogoTile className="bg-lime text-ink" />
            <LogoTile
              className="bg-deep text-paper"
              markClassName="text-lime"
            />
            <LogoTile className="bg-night text-paper" />
            <LogoTile className="bg-lilac text-ink" />
          </div>
        </Block>
        <div className="grid gap-12 lg:grid-cols-2">
          <Block
            label="Minimum sizes"
            note="Keep clear space equal to half the mark's height on every side. The lockup is never narrower than 80px; below that, use the mark alone, down to 16px."
          >
            <div className="rounded-2xl bg-grey-1 p-6">
              <div className="flex flex-wrap items-end gap-6">
                {[40, 27, 16, 10].map((height) => (
                  <div key={height} className="flex flex-col items-start gap-2">
                    <Logo height={height} />
                    <Token>{Math.round((height * 300) / 74)}px</Token>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex items-end gap-6">
                {[48, 32, 24, 16].map((height) => (
                  <div key={height} className="flex flex-col items-start gap-2">
                    <Mark height={height} />
                    <Token>{height}px</Token>
                  </div>
                ))}
              </div>
            </div>
          </Block>
          <Block label="Please don't">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                'Stretch or squash it',
                'Rotate it',
                'Recolour the mark alone in off-palette colours',
                'Place it on busy gradients',
                'Fade it or add effects',
                'Put it on a photo without a solid field behind it',
              ].map((rule) => (
                <li
                  key={rule}
                  className="flex gap-3 rounded-xl bg-grey-1 px-4 py-3 text-small"
                >
                  <span aria-hidden className="text-attention">
                    ✕
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
          </Block>
        </div>
      </Section>

      <Section
        id="colour"
        title="Colour"
        intro="Surfaces are white and four warm greys, never borders. Lime marks the one action that matters, lilac marks anything Dossier drafted, and status is a word in a soft tag."
      >
        <Block label="Product palette">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Swatch
              name="White"
              token="white"
              hex="#FFFFFF"
              role="Canvas, sheets"
              className="bg-white text-ink ring-1 ring-grey-2 ring-inset"
            />
            <Swatch
              name="Grey 1"
              token="grey-1"
              hex="#F7F6F3"
              role="List items"
              className="bg-grey-1 text-ink"
            />
            <Swatch
              name="Grey 2"
              token="grey-2"
              hex="#F1EFEA"
              role="Panels"
              className="bg-grey-2 text-ink"
            />
            <Swatch
              name="Grey 3"
              token="grey-3"
              hex="#E7E4DD"
              role="Inactive tabs"
              className="bg-grey-3 text-ink"
            />
            <Swatch
              name="Stone"
              token="stone"
              hex="#D6D3CC"
              role="Calm, outlines"
              className="bg-stone text-ink"
            />
            <Swatch
              name="Ink"
              token="ink"
              hex="#13232A"
              role="Text, strong"
              className="bg-ink text-paper"
            />
            <Swatch
              name="Lime · act"
              token="lime"
              hex="#E8F54C"
              role="The one action"
              className="bg-lime text-ink"
            />
            <Swatch
              name="Lilac · drafted"
              token="lilac"
              hex="#B9A8FF"
              role="Dossier drafted"
              className="bg-lilac text-ink"
            />
          </div>
        </Block>
        <div className="grid gap-12 lg:grid-cols-2">
          <Block label="Text">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-grey-1 p-4">
                <p className="text-ink">Ink</p>
                <Token className="block">text-ink</Token>
                <Token className="block">#13232A</Token>
              </div>
              <div className="rounded-2xl bg-grey-1 p-4">
                <p className="text-muted">Muted</p>
                <Token className="block">text-muted</Token>
                <Token className="block">#6B706C</Token>
              </div>
              <div className="rounded-2xl bg-ink p-4">
                <p className="text-paper">Paper</p>
                <Token className="block text-paper/70">text-paper</Token>
                <Token className="block text-paper/70">#F5F3EE</Token>
              </div>
            </div>
          </Block>
          <Block label="Status · soft tint behind, deep tone for the word">
            <div className="grid gap-3">
              <StatusPair
                tone="attention"
                label="Attention"
                tokens="attention · attention-soft"
              />
              <StatusPair
                tone="act"
                label="12 days"
                tokens="lime-ink · lime-soft"
              />
              <StatusPair
                tone="drafted"
                label="Draft ready"
                tokens="lilac-ink · lilac-soft"
              />
              <StatusPair
                tone="healthy"
                label="Healthy"
                tokens="healthy · healthy-soft"
              />
              <StatusPair
                tone="neutral"
                label="Neutral"
                tokens="muted · grey-1"
              />
            </div>
          </Block>
        </div>
        <Block
          label="Brand palette · covers, slides, marketing and dark sections"
          note="Deep is the base of the brand's own surfaces. Stone deep and night give photography room. Plum and maroon are occasional tile colours, never text colours."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Swatch
              name="Deep"
              token="deep"
              hex="#002E3B"
              role="Base, panels"
              className="bg-deep text-paper"
            />
            <Swatch
              name="Paper"
              token="paper"
              hex="#F5F3EE"
              role="Light canvas"
              className="bg-paper text-ink"
            />
            <Swatch
              name="Night"
              token="night"
              hex="#141716"
              role="Dark sections"
              className="bg-night text-paper"
            />
            <Swatch
              name="Stone deep"
              token="stone-deep"
              hex="#4C4842"
              role="Photo fields"
              className="bg-stone-deep text-paper"
            />
            <Swatch
              name="Lilac deep"
              token="lilac-deep"
              hex="#8F7BFF"
              role="Data"
              className="bg-lilac-deep text-ink"
            />
            <Swatch
              name="Plum"
              token="plum"
              hex="#3E3654"
              role="Tiles"
              className="bg-plum text-paper"
            />
            <Swatch
              name="Maroon"
              token="maroon"
              hex="#5B302C"
              role="Tiles"
              className="bg-maroon text-paper"
            />
          </div>
        </Block>
        <Block label="Proportion · brand surfaces">
          <div className="flex h-12 overflow-hidden rounded-xl font-mono text-label">
            {[
              ['40% paper', 'w-[40%] bg-paper text-ink'],
              ['25% deep', 'w-[25%] bg-deep text-paper'],
              ['12% stone', 'w-[12%] bg-stone text-ink'],
              ['10% lime', 'w-[10%] bg-lime text-ink'],
              ['8% lilac', 'w-[8%] bg-lilac text-ink'],
              ['5%', 'w-[5%] bg-night text-paper'],
            ].map(([label, className]) => (
              <div
                key={label}
                className={cn(
                  'flex items-center overflow-hidden px-2 whitespace-nowrap',
                  className,
                )}
              >
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </Block>
      </Section>

      <Section
        id="type"
        title="Typography"
        intro="Bricolage Grotesque for headlines, big numbers and short statements: Light and Regular, set tight at −4%, sentence case, never all caps outside the wordmark. Geist for body and interface. Geist Mono for sources, labels, dates and numbers in tables."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-3xl bg-night p-7 text-paper">
            <p className="font-display text-[7rem] leading-none font-light tracking-[-0.04em] text-lime">
              Aa
            </p>
            <p className="mt-6 font-display text-h3">Bricolage Grotesque</p>
            <Token className="text-paper/60">font-display · 300 400 500</Token>
          </div>
          <div className="rounded-3xl bg-grey-1 p-7">
            <p className="text-[7rem] leading-none tracking-tight">Aa</p>
            <p className="mt-6 text-h3 font-medium tracking-tight">Geist</p>
            <Token>font-sans · 400 500 600</Token>
          </div>
          <div className="rounded-3xl bg-grey-1 p-7">
            <p className="font-mono text-[7rem] leading-none tracking-tight">
              Aa
            </p>
            <p className="mt-6 font-mono text-h3 tracking-tight">Geist Mono</p>
            <Token>font-mono · 400 500</Token>
          </div>
        </div>
        <Block label="Bricolage weights">
          <div className="space-y-1 font-display text-h2">
            <p className="font-light">
              Light · Know every client before the call
            </p>
            <p>Regular · Know every client before the call</p>
            <p className="font-medium">
              Medium · Know every client before the call
            </p>
          </div>
        </Block>
        <Block label="Hierarchy">
          <div className="divide-y divide-grey-2">
            <TypeRow name="Display" spec="text-display · 64/64 · Light">
              <p className="font-display text-h1 sm:text-display">One file</p>
            </TypeRow>
            <TypeRow name="H1" spec="text-h1 · 40/44">
              <p className="font-display text-h1">Know every client</p>
            </TypeRow>
            <TypeRow name="H2" spec="text-h2 · 28/32">
              <p className="font-display text-h2">What needs attention</p>
            </TypeRow>
            <TypeRow name="H3" spec="text-h3 · 22/26">
              <p className="font-display text-h3">
                Backups failing on 2 workstations
              </p>
            </TypeRow>
            <TypeRow name="Body" spec="text-body · 15/22 · Geist">
              <p className="text-body">
                Dossier reads the tools you already use.
              </p>
            </TypeRow>
            <TypeRow name="Small" spec="text-small · 13/18 · Geist">
              <p className="text-small text-muted">
                Read 4 min ago from 4 tools
              </p>
            </TypeRow>
            <TypeRow name="Label" spec="font-mono text-label uppercase">
              <p className="font-mono text-label uppercase">
                Source · Fathom · 28 Oct
              </p>
            </TypeRow>
          </div>
          <p className="mt-4 text-small text-muted">
            h1, h2 and h3 are Bricolage by default; add{' '}
            <Token>font-display</Token> for big numbers and statements
            elsewhere.
          </p>
        </Block>
      </Section>

      <Section
        id="buttons"
        title="Buttons"
        intro="A button is a closed file: a pill with its tab on top. Idle, it is the mark and a label. One lime button per screen."
      >
        <Block label="File buttons">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="act">Connect your tools</Button>
            <Button variant="ink">Open the record</Button>
            <Button variant="outline">Edit</Button>
            <Button variant="drafted">Accept draft</Button>
            <MarkButton>Ask Dossier</MarkButton>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
            <Token>variant=&quot;act&quot;</Token>
            <Token>variant=&quot;ink&quot;</Token>
            <Token>variant=&quot;outline&quot;</Token>
            <Token>variant=&quot;drafted&quot;</Token>
            <Token>{'<MarkButton>'}</Token>
          </div>
        </Block>
        <Block label="Sizes · S 28, M 36, L 48">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="act" size="sm">
              Connect your tools
            </Button>
            <Button variant="act" size="md">
              Connect your tools
            </Button>
            <Button variant="act" size="lg">
              Connect your tools
            </Button>
          </div>
        </Block>
        <Block
          label="States"
          note="Hover deepens the fill, pressing deepens it further, and keyboard focus draws a 2px ink ring. Disabled buttons turn grey."
        >
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ink">Hover me</Button>
            <Button variant="act" disabled>
              Connect your tools
            </Button>
            <Button variant="outline" disabled>
              Edit
            </Button>
          </div>
        </Block>
      </Section>

      <Section
        id="tags"
        title="Tags"
        intro="Status is a word in a soft tag, never a colour alone."
      >
        <Block label="Status · words in soft tags">
          <div className="flex flex-wrap gap-2">
            <Tag tone="attention">Attention</Tag>
            <Tag tone="act">12 days</Tag>
            <Tag tone="drafted">Draft ready</Tag>
            <Tag tone="healthy">Healthy</Tag>
            <Tag tone="neutral">Neutral</Tag>
          </div>
        </Block>
      </Section>

      <Section
        id="sheets"
        title="Tabs and sheets"
        intro="A white sheet on grey, never a border. Tabs are file dividers: the active tab is white and joins the sheet; the rest step back in grey."
      >
        <Block label="Layering · white sheet on grey">
          <div className="rounded-3xl bg-grey-2 p-3 sm:p-4">
            <div className="flex overflow-x-auto">
              {[
                ['Overview', null],
                ['Devices', 12],
                ['Files', 38],
                ['Meetings', 6],
                ['Audit log', null],
              ].map(([label, count], index, all) => {
                const active = index === 0;
                return (
                  <div
                    key={label}
                    style={{ zIndex: all.length - index }}
                    className={cn(
                      'relative flex h-11 min-w-36 shrink-0 items-center gap-2 rounded-t-2xl px-5 whitespace-nowrap',
                      index > 0 && '-ml-3',
                      active ? 'bg-white text-ink' : 'bg-grey-3 text-muted',
                    )}
                  >
                    {label}
                    {count !== null && (
                      <span className="rounded-full bg-white px-2 font-mono text-label leading-5 text-muted">
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="rounded-2xl rounded-tl-none bg-white p-4 sm:p-5">
              <ListItem />
              <div className="h-24" />
            </div>
          </div>
        </Block>
        <Block label="List item · grey, no rules">
          <div className="max-w-xl">
            <ListItem />
          </div>
        </Block>
        <Block label="Feature cards · dashboard and landing page">
          <div className="grid gap-3 rounded-3xl bg-grey-2 p-3 sm:p-4 lg:grid-cols-3">
            {[
              ['Read only', 'Nothing in your tools ever changes'],
              ['Cited', 'Every line points to its record'],
              ['One file', 'Devices, files and meetings together'],
            ].map(([eyebrow, title]) => (
              <div key={title} className="rounded-2xl bg-white p-6 lg:min-h-56">
                <p className="text-small text-muted">{eyebrow}</p>
                <h3 className="mt-2 text-h2">{title}</h3>
              </div>
            ))}
          </div>
        </Block>
      </Section>

      <Section
        id="folders"
        title="Folders"
        intro="Each client is a folder. The tab's colour is what the file needs."
      >
        <Block label="Folder tab colour = what the file needs">
          <div className="grid gap-4 sm:grid-cols-3">
            <FolderExample tone="act" title="Act" meta="Needs attention" />
            <FolderExample
              tone="drafted"
              title="Drafted"
              meta="Dossier wrote it"
            />
            <FolderExample tone="calm" title="Calm" meta="All healthy" />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
            <Token>tone=&quot;act&quot;</Token>
            <Token>tone=&quot;drafted&quot;</Token>
            <Token>tone=&quot;calm&quot;</Token>
          </div>
        </Block>
        <Block label="Client folders">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <FolderExample
              tone="act"
              title="Harbour Dental"
              meta="3 need attention"
            />
            <FolderExample
              tone="drafted"
              title="Northgate Legal"
              meta="1 renewal"
            />
            <FolderExample
              tone="calm"
              title="Brightway Care"
              meta="All healthy"
            />
            <FolderExample
              tone="calm"
              title="Oakley & Sons"
              meta="Meeting Thu"
            />
            <FolderExample
              tone="calm"
              title="Fern Street Vets"
              meta="All healthy"
            />
            <FolderExample tone="act" title="Kiln Studio" meta="2 alerts" />
          </div>
        </Block>
        <Block label="Cited files · each source a file in the stack, the latest in front">
          <CitedStack
            className="max-w-sm"
            files={[
              {
                source: 'Fathom',
                date: '30 Oct',
                title: 'Northgate · licence call',
              },
              {
                source: 'Fathom',
                date: '28 Oct',
                title: 'Harbour · quarterly call',
              },
              { source: 'Fathom', date: '3 Nov', title: 'Kiln · site visit' },
            ]}
          />
        </Block>
      </Section>

      <Section
        id="pattern"
        title="Pattern"
        intro="Patterns are built only from the mark. Index mirrors it on a grid, for backgrounds, banners and splash screens. One pattern per surface."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Block label="Index · light">
            <div className="rounded-3xl bg-grey-2 p-6 text-stone">
              <IndexPattern
                accents={[
                  [0, 6],
                  [2, 1],
                  [3, 3],
                  [4, 5],
                ]}
              />
            </div>
          </Block>
          <Block label="Index · on deep, lime accents">
            <div className="rounded-3xl bg-deep p-6 text-paper/10">
              <IndexPattern
                accents={[
                  [0, 2],
                  [1, 5],
                  [3, 0],
                  [4, 4],
                ]}
              />
            </div>
          </Block>
        </div>
        <Block label="Banner · lime with the Index pattern">
          <div className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-lime from-40% to-lime-soft p-8 sm:p-10">
            <div className="relative max-w-md">
              <h3 className="text-h2 sm:text-h1">
                Every promise from every call, in the file.
              </h3>
              <p className="mt-6">Connect Fathom in two minutes.</p>
              <Button variant="ink" className="mt-5">
                Connect Fathom
              </Button>
            </div>
            <IndexPattern
              rows={6}
              cols={7}
              accents={[
                [0, 4],
                [1, 6],
                [3, 1],
                [4, 3],
                [5, 5],
              ]}
              accentClassName="text-ink"
              className="pointer-events-none absolute top-0 right-0 -z-10 hidden h-full w-auto text-ink/10 md:block"
            />
          </div>
        </Block>
      </Section>

      <Section
        id="states"
        title="States"
        intro="Six states, built once and reused on every screen. Say what happened and what to do next. Never “Oops”."
      >
        <div className="grid gap-x-6 gap-y-12 lg:grid-cols-2">
          <Block
            label="1 · Loading"
            note="Pages: the Index loader, lime passing across the mark, the height of the content it stands in for. It shows only once a wait runs past a beat; then the content’s sections spring in one after another. No grey skeletons, no spinners, no pulse."
          >
            <IndexLoader className="h-44 rounded-3xl bg-grey-1" />
          </Block>
          <Block label="1 · Loading · Dossier at work">
            <div className="rounded-3xl bg-linear-to-b from-lilac-soft to-lilac-mist p-7">
              <p className="flex items-center gap-2 text-small text-lilac-ink">
                <Mark height={14} />
                Dossier is drafting
              </p>
              <h3 className="mt-3 text-h2">
                Reading 214 records at Harbour Dental.
              </h3>
              <div
                role="progressbar"
                aria-label="Reading records"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={64}
                className="mt-8 h-1.5 max-w-72 overflow-hidden rounded-full bg-white"
              >
                <div className="h-full w-[64%] rounded-full bg-lilac" />
              </div>
              <p className="mt-3 text-small text-muted">
                NinjaOne ✓ · Hudu ✓ · Fathom…
              </p>
            </div>
          </Block>

          <Block label="2 · Empty">
            <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl bg-grey-1 px-6 py-12 text-center">
              <h3 className="text-h2">No clients yet.</h3>
              <p className="mt-2 max-w-sm text-muted">
                Dossier finds your clients in NinjaOne and Hudu once they are
                connected.
              </p>
              <Button variant="act" className="mt-6">
                Connect your tools
              </Button>
            </div>
          </Block>
          <Block label="2 · Empty · all done">
            <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl bg-grey-1 px-6 py-12 text-center">
              <h3 className="text-h2">Nothing waiting.</h3>
              <p className="mt-2 max-w-sm text-muted">
                Everything this week is approved. Draft the next set when you’re
                ready.
              </p>
            </div>
          </Block>

          <Block label="3 · Error · a field">
            <label htmlFor="brand-client-id" className="text-small font-medium">
              Client ID
            </label>
            <input
              id="brand-client-id"
              defaultValue="8f1c-4a7e"
              aria-invalid
              aria-describedby="brand-client-id-error"
              className="mt-2 h-11 w-full rounded-xl bg-attention-soft px-4 text-ink focus-visible:outline-attention"
            />
            <p
              id="brand-client-id-error"
              className="mt-2 text-small text-attention"
            >
              That ID didn’t work. Check it was copied whole, then try again.
            </p>
          </Block>
          <Block label="3 · Error · a page">
            <div className="rounded-3xl bg-attention-soft p-7">
              <h3 className="text-h2 text-attention">
                Dossier couldn’t load this page.
              </h3>
              <p className="mt-2 text-attention">
                Your files are safe. This is on our side. Reference DSR-4102.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="ink">Try again</Button>
                <Button variant="outline">Go to Home</Button>
              </div>
            </div>
          </Block>
        </div>

        <Block label="4 · Sync stopped and offline">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-lime-soft px-5 py-3">
              <Tag tone="attention">Attention</Tag>
              <p className="min-w-0 flex-1">
                <strong className="font-semibold">
                  Fathom stopped syncing.
                </strong>{' '}
                Its token expired on 3 Nov. Meetings after that date are
                missing.
              </p>
              <Button variant="act" size="sm">
                Reconnect
              </Button>
            </div>
            <p className="rounded-lg bg-ink px-5 py-2.5 text-small text-paper">
              You’re offline. Showing what Dossier last read at 09:41.
            </p>
          </div>
        </Block>

        <div className="grid gap-x-6 gap-y-12 lg:grid-cols-2">
          <Block label="5 · Confirm">
            <div className="rounded-3xl bg-white p-7 shadow-float">
              <h3 className="text-h2">Disconnect Hudu?</h3>
              <p className="mt-3 text-muted">
                Dossier stops reading Hudu and removes its 312 assets from every
                client file. Nothing in Hudu changes.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button variant="ink">Disconnect</Button>
                <Button variant="outline">Keep it</Button>
              </div>
            </div>
          </Block>
          <Block
            label="6 · Success"
            note="Toasts sit bottom centre for 5 seconds. Undo wherever it can be undone."
          >
            <div className="space-y-3">
              {[
                'Invite sent to ama@ghostsavvy.com',
                'Report approved. Sends Monday at 09:00',
              ].map((message) => (
                <div
                  key={message}
                  className="flex items-center justify-between gap-4 rounded-xl bg-ink px-5 py-4 text-paper"
                >
                  <p>{message}</p>
                  <button
                    type="button"
                    className="rounded font-medium text-lime hover:underline"
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          </Block>
        </div>
      </Section>

      <Section
        id="voice"
        title="Voice"
        intro="Like the colleague who already read the file."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            [
              'Plain',
              'See what needs attention at each client.',
              'Unlock holistic client intelligence.',
            ],
            [
              'Specific',
              'Backups failing on 2 workstations.',
              'Some issues were detected.',
            ],
            [
              'Cited',
              'From Fathom, call on 28 Oct.',
              'AI thinks this is important.',
            ],
            [
              'Calm',
              '3 things need attention.',
              'Urgent! Critical risks found!',
            ],
            [
              'Read-only',
              'Dossier only ever reads.',
              'Dossier manages your stack.',
            ],
          ].map(([principle, say, avoid]) => (
            <div
              key={principle}
              className="flex flex-col rounded-2xl bg-grey-1 p-5"
            >
              <p className="font-mono text-label text-muted uppercase">
                {principle}
              </p>
              <p className="mt-3 font-display text-h3">“{say}”</p>
              <p className="mt-auto pt-6 text-small text-muted">
                <span className="text-attention">Not</span> {avoid}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <footer className="mt-24 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-deep px-7 py-6 text-paper">
        <Logo height={22} markClassName="text-lime" />
        <p className="text-small text-paper/70">
          From the brand book (v1.0) and the dashboard system boards (v3) in
          public/brand.
        </p>
      </footer>
    </div>
  );
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 pt-24"
    >
      <h2 id={`${id}-title`} className="text-h1">
        {title}
      </h2>
      {intro && <p className="mt-3 max-w-2xl text-base text-muted">{intro}</p>}
      <div className="mt-10 space-y-12">{children}</div>
    </section>
  );
}

function Block({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-3 text-small text-muted">{label}</p>
      {children}
      {note && <p className="mt-3 max-w-xl text-small text-muted">{note}</p>}
    </div>
  );
}

function Token({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <code className={cn('font-mono text-label text-muted', className)}>
      {children}
    </code>
  );
}

function LogoTile({
  className,
  markClassName,
}: {
  className: string;
  markClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-36 items-center justify-center rounded-2xl',
        className,
      )}
    >
      <Logo height={30} markClassName={markClassName} />
    </div>
  );
}

function Swatch({
  name,
  token,
  hex,
  role,
  className,
}: {
  name: string;
  token: string;
  hex: string;
  role: string;
  className: string;
}) {
  return (
    <div
      className={cn(
        'flex h-36 flex-col justify-between rounded-2xl p-3.5',
        className,
      )}
    >
      <div>
        <p className="text-small font-medium">{name}</p>
        <p className="text-small opacity-70">{role}</p>
      </div>
      <div className="font-mono text-label">
        <p>{hex}</p>
        <p className="opacity-70">{token}</p>
      </div>
    </div>
  );
}

function StatusPair({
  tone,
  label,
  tokens,
}: {
  tone: TagTone;
  label: string;
  tokens: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Tag tone={tone} className="min-w-24 justify-center">
        {label}
      </Tag>
      <Token>{tokens}</Token>
    </div>
  );
}

function TypeRow({
  name,
  spec,
  children,
}: {
  name: string;
  spec: string;
  children: ReactNode;
}) {
  return (
    <div className="grid items-baseline gap-2 py-5 sm:grid-cols-[8rem_1fr_auto] sm:gap-6">
      <p className="font-mono text-label text-muted uppercase">{name}</p>
      <div className="min-w-0">{children}</div>
      <Token>{spec}</Token>
    </div>
  );
}

function ListItem() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-grey-1 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Backups failing on 2 workstations
          <sup className="ml-1 font-mono text-[0.625rem] text-lilac-ink">1</sup>
        </p>
        <p className="text-small text-muted">Harbour Dental · since 26 Oct</p>
      </div>
      <Tag tone="attention">Attention</Tag>
      <p className="w-20 text-right text-small text-muted">NinjaOne</p>
    </div>
  );
}

function FolderExample({
  tone,
  title,
  meta,
}: {
  tone: FolderTone;
  title: string;
  meta: string;
}) {
  return (
    <Folder tone={tone} bodyClassName="flex min-h-32 flex-col justify-between">
      <p className="text-base">{title}</p>
      <p className="text-small text-muted">{meta}</p>
    </Folder>
  );
}
