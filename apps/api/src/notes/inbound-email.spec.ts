import { NOTE_MAX_LENGTH } from '@dossierhq/contracts';
import {
  bodyOf,
  dayOf,
  domainsIn,
  inboxTokenOf,
  titleOf,
  webhookAuthorized,
  type PostmarkInbound,
} from './inbound-email.js';

const TOKEN = 'a'.repeat(32);
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
const email = (fields: Partial<PostmarkInbound> = {}): PostmarkInbound => ({
  FromFull: { Email: 'sam@msp.example' },
  ...fields,
});

describe('inbound email', () => {
  it('lets in only the webhook’s token, as a Basic password', () => {
    expect(webhookAuthorized(basic('postmark', TOKEN), TOKEN)).toBe(true);
    expect(webhookAuthorized(basic('anyone', TOKEN), TOKEN)).toBe(true);
    expect(webhookAuthorized(basic('postmark', 'wrong'), TOKEN)).toBe(false);
    expect(webhookAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(false);
    expect(webhookAuthorized(undefined, TOKEN)).toBe(false);
  });

  it('finds the workspace’s token after the +', () => {
    const token = '0123456789abcdef0123';
    expect(inboxTokenOf(email({ MailboxHash: token }))).toBe(token);
    expect(
      inboxTokenOf(
        email({ OriginalRecipient: `notes+${token}@inbound.example` }),
      ),
    ).toBe(token);
    expect(
      inboxTokenOf(
        email({
          ToFull: [{ Email: `NOTES+${token.toUpperCase()}@inbound.example` }],
        }),
      ),
    ).toBe(token);
    // Anything else after a + isn't a token.
    expect(
      inboxTokenOf(email({ OriginalRecipient: 'notes+hi@inbound.example' })),
    ).toBeNull();
    expect(inboxTokenOf(email())).toBeNull();
  });

  it('titles notes by their subject, without Fwd: and Re:', () => {
    expect(titleOf('Fwd: RE: fw: Harbour Dental QBR')).toBe(
      'Harbour Dental QBR',
    );
    expect(titleOf('  ')).toBe('Forwarded notes');
    expect(titleOf(null)).toBe('Forwarded notes');
    expect(titleOf('x'.repeat(300))).toHaveLength(200);
  });

  it('keeps the plain text, or makes the HTML plain', () => {
    expect(
      bodyOf(email({ TextBody: 'Line one  \r\n\r\n\r\n\r\nLine two' })),
    ).toBe('Line one\n\nLine two');
    expect(
      bodyOf(
        email({
          TextBody: ' ',
          HtmlBody:
            '<style>p{}</style><p>They&#39;re moving&nbsp;office</p><ul><li>New firewall</li><li>VPN &amp; Wi-Fi</li></ul>',
        }),
      ),
    ).toBe('They’re moving office\n• New firewall\n• VPN & Wi-Fi');
    expect(bodyOf(email())).toBe('');
    expect(
      bodyOf(email({ TextBody: 'x'.repeat(NOTE_MAX_LENGTH + 10) })),
    ).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('dates notes by the day sent, where the workspace is', () => {
    const now = new Date('2030-06-01T12:00:00Z');
    // 23:30 in New York is already the next day in London.
    expect(dayOf('Mon, 13 May 2030 23:30:00 -0400', 'Europe/London', now)).toBe(
      '2030-05-14',
    );
    expect(
      dayOf('Mon, 13 May 2030 23:30:00 -0400', 'America/New_York', now),
    ).toBe('2030-05-13');
    expect(dayOf('not a date', 'Europe/London', now)).toBe('2030-06-01');
    expect(dayOf(undefined, 'Europe/London', now)).toBe('2030-06-01');
  });

  it('collects the domains of everyone it mentions', () => {
    expect(
      domainsIn(
        email({
          ToFull: [{ Email: 'notes+x@inbound.example' }],
          CcFull: [{ Email: 'Priya@HarbourDental.co.uk' }],
          TextBody:
            '---------- Forwarded message ---------\nFrom: Ann <ann@marlowfreight.com>\nTo: sam@msp.example',
        }),
      ),
    ).toEqual([
      'inbound.example',
      'harbourdental.co.uk',
      'marlowfreight.com',
      'msp.example',
    ]);
  });
});
