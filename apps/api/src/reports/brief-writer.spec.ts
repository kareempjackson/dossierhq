import type { ReportSection } from '@dossierhq/contracts';
import { IntelligenceFailure } from '../intelligence/intelligence.service.js';
import { BriefWriter, type Drafted } from './brief-writer.js';

const WEEK = { start: '2026-10-26', end: '2026-11-01' };

const sections: ReportSection[] = [
  {
    kind: 'brief',
    title: 'The week in brief',
    lines: [
      { id: 'line-9', text: 'Nothing urgent this week.', sourceIds: ['count'] },
    ],
  },
  {
    kind: 'from-you',
    title: 'What we need from you',
    lines: [
      {
        id: 'line-1',
        text: 'Approve replacing two laptops by 30 November.',
        sourceIds: ['src-rec'],
      },
      {
        id: 'line-2',
        text: '“Printer offline” is waiting on your reply.',
        sourceIds: ['src-ticket'],
      },
    ],
  },
  {
    kind: 'done',
    title: 'What we did',
    lines: [
      { id: 'line-3', text: 'Resolved “VPN drops”.', sourceIds: ['src-vpn'] },
      // Cites nothing, so the model never sees it.
      { id: 'line-4', text: 'Uncited.', sourceIds: [] },
    ],
  },
  {
    kind: 'questions',
    title: 'Your questions',
    lines: [
      {
        id: 'q-1',
        question: 'Any Windows 10?',
        text: 'Dossier is answering this…',
        sourceIds: [],
        pending: true,
      },
    ],
  },
];

const report = (audience: Drafted['audience']): Drafted => ({
  clientId: 'acme',
  title: 'Acme weekly report',
  audience,
  sections,
});

function writerWith(run: (...args: unknown[]) => Promise<unknown>) {
  const intelligence = { run: vi.fn(run) };
  return {
    writer: new BriefWriter(intelligence as never),
    intelligence,
  };
}

const write = (writer: BriefWriter, audience: Drafted['audience']) =>
  writer.write('ws', report(audience), WEEK, '2026-10-28');

/** In the context, L1 is the brief, L2–L3 what's needed, L4 what was done. */
const executiveReply = {
  brief: 'A quiet week (L1); we need two answers from you [L2, L3].',
  lines: ['L1', 'L2', 'L3'],
  fromYou: [
    { text: 'Please approve two new laptops by 30 November.', lines: ['L2'] },
    { text: 'Ann’s printer request needs your reply.', lines: ['L3'] },
  ],
  done: [{ text: 'Staff working from home stay connected.', lines: ['L4'] }],
  watching: [{ text: 'Rests on nothing.', lines: ['L99'] }],
  comingUp: [],
};

describe('BriefWriter', () => {
  it('rewrites the top of the report for leadership, citing what the lines cite', async () => {
    const { writer, intelligence } = writerWith(async () => executiveReply);
    const written = await write(writer, 'executive');

    expect(written).toEqual({
      brief: {
        text: 'A quiet week; we need two answers from you.',
        sourceIds: ['count', 'src-rec', 'src-ticket'],
      },
      sections: {
        'from-you': [
          {
            text: 'Please approve two new laptops by 30 November.',
            sourceIds: ['src-rec'],
          },
          {
            text: 'Ann’s printer request needs your reply.',
            sourceIds: ['src-ticket'],
          },
        ],
        done: [
          {
            text: 'Staff working from home stay connected.',
            sourceIds: ['src-vpn'],
          },
        ],
        // Watching's one line cited nothing real, and coming up was empty.
      },
    });
    const [, request] = intelligence.run.mock.calls[0] as [
      string,
      { task: string; context: string },
    ];
    expect(request.task).toMatch(/not technical/);
    expect(request.context).not.toMatch(/Uncited|answering/);
  });

  it('keeps the rules’ What we need from you when the model drops an ask', async () => {
    const { writer } = writerWith(async () => ({
      ...executiveReply,
      fromYou: [executiveReply.fromYou[0]],
    }));
    const written = await write(writer, 'executive');
    expect(written?.sections['from-you']).toBeUndefined();
    expect(written?.sections.done).toHaveLength(1);
  });

  it('writes only a technical summary for a technician', async () => {
    const { writer, intelligence } = writerWith(async () => ({
      brief: '2 tickets open; #4821 waits on you.',
      lines: ['L3'],
    }));
    const written = await write(writer, 'technician');
    expect(written).toEqual({
      brief: {
        text: '2 tickets open; #4821 waits on you.',
        sourceIds: ['src-ticket'],
      },
      sections: {},
    });
    const [, request] = intelligence.run.mock.calls[0] as [
      string,
      { task: string },
    ];
    expect(request.task).toMatch(/looks after IT/);
  });

  it('gives up quietly when the brief rests on nothing or the model fails', async () => {
    const nothing = writerWith(async () => ({ ...executiveReply, lines: [] }));
    await expect(write(nothing.writer, 'executive')).resolves.toBeNull();

    const failing = writerWith(async () => {
      throw new IntelligenceFailure('failed', 'No credit.');
    });
    await expect(write(failing.writer, 'technician')).resolves.toBeNull();
  });
});
