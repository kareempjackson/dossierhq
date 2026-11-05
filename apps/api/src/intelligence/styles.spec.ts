import { describe, expect, it } from 'vitest';
import {
  briefLines,
  executiveBrief,
  leaksInternal,
  lineOrNull,
} from './styles.js';

const note =
  'Licence server service stopped after the patch on Tuesday. Restarted it; the vendor says their next update fixes the start-up order.';

describe('leaksInternal', () => {
  it('catches eight words in a row from an internal note, whatever the case or punctuation', () => {
    expect(
      leaksInternal(
        ['The LICENCE server service stopped — after the patch, on Tuesday!'],
        [note],
      ),
    ).toBe(true);
    expect(
      leaksInternal(['the vendor says their next update fixes it'], [note]),
    ).toBe(false);
  });

  it('lets through what only shares a few words, and anything when there are no notes', () => {
    expect(
      leaksInternal(
        ['The licence server needs a restart after updates.'],
        [note],
      ),
    ).toBe(false);
    expect(leaksInternal([note], [])).toBe(false);
    expect(leaksInternal([note], ['Too short to copy'])).toBe(false);
  });
});

describe('executiveBrief', () => {
  it('tidies what the model wrote and keeps at most four points', () => {
    const brief = executiveBrief({
      headline: '  Keep patient images safe\n',
      points: ['One', '', ' Two ', 'Three', 'Four', 'Five'],
      decision: '   ',
    });
    expect(brief).toEqual({
      headline: 'Keep patient images safe',
      points: ['One', 'Two', 'Three', 'Four'],
      decision: null,
    });
    expect(briefLines(brief!)).toEqual([
      'Keep patient images safe',
      'One',
      'Two',
      'Three',
      'Four',
    ]);
  });

  it('reads "None" and the like as nothing', () => {
    expect(
      executiveBrief({
        headline: 'Fix the backups',
        points: ['n/a', 'Backups failed three nights running.'],
        decision: 'None.',
      }),
    ).toEqual({
      headline: 'Fix the backups',
      points: ['Backups failed three nights running.'],
      decision: null,
    });
    expect(lineOrNull('None', 300)).toBeNull();
    expect(
      lineOrNull('Booking takes ages (E1) and queues back up [E2, E3]', 300),
    ).toBe('Booking takes ages and queues back up');
    expect(lineOrNull(' No decision needed ', 300)).toBeNull();
    expect(lineOrNull('None of the PCs are patched', 300)).toBe(
      'None of the PCs are patched',
    );
  });

  it('is null without a headline, or when any line copies an internal note', () => {
    expect(executiveBrief(undefined)).toBeNull();
    expect(
      executiveBrief({ headline: ' ', points: ['A point'], decision: null }),
    ).toBeNull();
    expect(
      executiveBrief(
        {
          headline: 'Fix the X-ray viewer',
          points: ['Fine on its own.'],
          decision:
            'Agree that the vendor says their next update fixes the start-up order.',
        },
        [note],
      ),
    ).toBeNull();
  });
});
