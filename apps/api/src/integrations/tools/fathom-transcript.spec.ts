import { describe, expect, it } from 'vitest';
import { attributed } from './fathom.js';

const invitees = [
  { name: 'Priya Nair', email: 'priya@harbourdental.co.uk', is_external: true },
  { name: 'Sam Okafor', email: 'sam@larkspur.example', is_external: false },
];
const turn = (
  name: string | null,
  text: string,
  timestamp: string,
  email: string | null = null,
) => ({
  speaker: { display_name: name, matched_calendar_invitee_email: email },
  text,
  timestamp,
});

describe('attributed', () => {
  it('names each side by invitee email, then name, then who recorded it', () => {
    const turns = attributed(
      [
        turn(
          'Priya N.',
          'The backups failed again.',
          '00:01:00',
          'PRIYA@harbourdental.co.uk',
        ),
        turn('Priya Nair', 'Twice this week.', '00:01:05'),
        turn('Jess Patel', 'I will look today.', '00:01:30'),
        turn('Reception iPad', 'Can everyone hear me?', '00:02:00'),
        turn('Sam Okafor', '', '00:02:10'),
        turn('Sam Okafor', 'No timestamp', 'soon'),
      ],
      invitees,
      'Jess Patel',
    );
    expect(turns).toEqual([
      {
        at: '00:01:00',
        speaker: 'Priya Nair',
        email: 'priya@harbourdental.co.uk',
        role: 'client',
        text: 'The backups failed again. Twice this week.',
      },
      // Not invited, but she recorded it: the MSP's.
      {
        at: '00:01:30',
        speaker: 'Jess Patel',
        email: null,
        role: 'msp',
        text: 'I will look today.',
      },
      {
        at: '00:02:00',
        speaker: 'Reception iPad',
        email: null,
        role: null,
        text: 'Can everyone hear me?',
      },
    ]);
  });

  it('redacts what looks like a password', () => {
    const [said] = attributed(
      [turn('Priya Nair', 'The wifi password is Summer2026! now.', '00:00:10')],
      invitees,
      null,
    );
    expect(said!.text).toBe('The wifi password is [redacted] now.');
  });
});
