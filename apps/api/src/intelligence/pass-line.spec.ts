import { describe, expect, it } from 'vitest';
import { passLine } from './scheduler.js';

describe('passLine', () => {
  it('says a quiet pass ran nothing', () => {
    expect(passLine('ws', { runs: 0, failed: 0, cost: 0 }, 420)).toBe(
      'Pass for ws: no model runs, 0.4 s',
    );
  });

  it('counts runs, failures and dollars', () => {
    expect(passLine('ws', { runs: 1, failed: 0, cost: 0.01234 }, 2000)).toBe(
      'Pass for ws: 1 model run, $0.0123, 2.0 s',
    );
    expect(passLine('ws', { runs: 12, failed: 3, cost: 1.5 }, 61_000)).toBe(
      'Pass for ws: 12 model runs (3 failed), $1.5000, 61.0 s',
    );
  });
});
