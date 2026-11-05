import { describe, expect, it } from 'vitest';
import { clientMayRead } from './ask.service.js';

const note =
  'MX records changed at the registrar. Admin password: [redacted] for the portal.';
const internalOf = new Map([['harbour-dental', [note]]]);

describe('clientMayRead', () => {
  it('turns down an answer about one client that repeats an internal note there', () => {
    expect(
      clientMayRead(
        [
          'Email stopped because the MX records changed at the registrar admin password',
        ],
        ['harbour-dental'],
        internalOf,
      ),
    ).toBe(false);
    expect(
      clientMayRead(
        ['Email stopped after a settings change; it is working again.'],
        ['harbour-dental'],
        internalOf,
      ),
    ).toBe(true);
  });

  it('lets an answer across clients through: only the MSP’s leadership reads it', () => {
    expect(
      clientMayRead(
        [`In short: ${note}`],
        ['harbour-dental', 'northside-legal'],
        internalOf,
      ),
    ).toBe(true);
    expect(clientMayRead([note], [], internalOf)).toBe(true);
  });
});
