import type { Report, ReportDelivery, Source } from '@dossierhq/contracts';
import type { StoredReportSettings } from '@dossierhq/database';
import { due } from './delivery.service.js';
import { dateRange, renderReportEmail } from './report-email.js';
import { inWeekOf, sendsAt, zonedInstant } from './schedule.js';

const FRIDAY_4PM = { weekday: 5, hour: 16 };

describe('report schedule', () => {
  it('finds the instant an hour falls on where the workspace is', () => {
    // Summer time in London, then winter time after 25 Oct 2026.
    expect(zonedInstant('2026-10-09', 16, 'Europe/London')).toBe(
      '2026-10-09T15:00:00.000Z',
    );
    expect(zonedInstant('2026-10-25', 12, 'Europe/London')).toBe(
      '2026-10-25T12:00:00.000Z',
    );
    expect(zonedInstant('2026-10-09', 16, 'America/New_York')).toBe(
      '2026-10-09T20:00:00.000Z',
    );
    expect(zonedInstant('2026-10-09', 0, 'Asia/Kolkata')).toBe(
      '2026-10-08T18:30:00.000Z',
    );
  });

  it('places a weekly time in the Monday-to-Sunday week of an instant', () => {
    expect(
      inWeekOf('2026-10-09T15:40:00.000Z', FRIDAY_4PM, 'Europe/London'),
    ).toBe('2026-10-09T15:00:00.000Z');
    // Late Sunday in London is already Monday in Tokyo: the next week.
    const sunday = '2026-10-11T22:30:00.000Z';
    expect(inWeekOf(sunday, FRIDAY_4PM, 'Europe/London')).toBe(
      '2026-10-09T15:00:00.000Z',
    );
    expect(inWeekOf(sunday, FRIDAY_4PM, 'Asia/Tokyo')).toBe(
      '2026-10-16T07:00:00.000Z',
    );
  });

  it('sends at the week’s time, or at once once that has passed', () => {
    expect(
      sendsAt('2026-10-08T10:00:00.000Z', FRIDAY_4PM, 'Europe/London'),
    ).toBe('2026-10-09T15:00:00.000Z');
    expect(
      sendsAt('2026-10-10T09:00:00.000Z', FRIDAY_4PM, 'Europe/London'),
    ).toBe('2026-10-10T09:00:00.000Z');
  });

  it('sends on schedule only what is approved, waiting, and has somewhere to go', () => {
    const settings: StoredReportSettings = {
      senderName: '',
      replyTo: null,
      brandColour: '#1f2937',
      logo: null,
      draftAt: null,
      sendAt: FRIDAY_4PM,
      sendFrom: '2026-10-01T00:00:00.000Z',
    };
    const report = {
      status: 'approved' as const,
      approvedAt: '2026-10-08T10:00:00.000Z',
      sentAt: null,
    };
    const to = [{ name: 'Ann', email: 'ann@x.example', copy: false }];
    const tz = 'Europe/London';
    expect(due(report, settings, tz, to, [])).toBe('2026-10-09T15:00:00.000Z');

    expect(
      due({ ...report, status: 'draft' }, settings, tz, to, []),
    ).toBeNull();
    expect(
      due(
        { ...report, sentAt: '2026-10-09T15:00:00.000Z' },
        settings,
        tz,
        to,
        [],
      ),
    ).toBeNull();
    expect(due(report, { ...settings, sendAt: null }, tz, to, [])).toBeNull();
    // Approved before sending was turned on.
    expect(
      due(
        report,
        { ...settings, sendFrom: '2026-10-08T11:00:00.000Z' },
        tz,
        to,
        [],
      ),
    ).toBeNull();
    // Only copies, or no one.
    expect(
      due(report, settings, tz, [{ ...to[0]!, copy: true }], []),
    ).toBeNull();
    expect(due(report, settings, tz, [], [])).toBeNull();
    // Tried before: a person sends it again.
    expect(
      due(report, settings, tz, to, [{ outcome: 'failed' } as ReportDelivery]),
    ).toBeNull();
  });
});

describe('report email', () => {
  const alert: Source = {
    id: 'src-alert',
    kind: 'record',
    clientId: 'harbour-dental',
    tool: 'ninjaone',
    recordId: 'ALERT-48213',
    recordType: 'Alert',
    title: 'Backups failed on HD-FS01',
    recordedAt: '2026-10-07T09:00:00.000Z',
    url: 'https://eu.ninjarmm.com/alerts/48213',
    fields: [],
  };
  const quote: Source = {
    id: 'src-quote',
    kind: 'meeting',
    clientId: 'harbour-dental',
    tool: 'fathom',
    recordId: 'MTG-1',
    recordType: 'Meeting',
    title: 'Quarterly review',
    recordedAt: '2026-10-06T14:00:00.000Z',
    url: 'https://fathom.video/calls/1',
    fields: [],
    meetingId: 'mtg-1',
    transcriptAt: '00:12:04',
    speakerRole: 'client',
    speakerName: 'Priya Shah',
    quote: 'We open the second surgery in March.',
  };
  const report: Report = {
    id: 'harbour-dental-2026-w41',
    clientId: 'harbour-dental',
    weekStart: '2026-10-05',
    weekEnd: '2026-10-11',
    status: 'approved',
    generatedAt: '2026-10-09T07:00:00.000Z',
    approvedAt: '2026-10-09T10:00:00.000Z',
    editedAt: null,
    sentAt: null,
    exceptions: [],
    title: 'Harbour Dental weekly report',
    glance: [{ label: 'Devices', value: '42', note: '2 offline' }],
    sections: [
      {
        kind: 'needs-attention',
        title: 'Needs attention',
        lines: [
          {
            id: 'l1',
            text: 'Backups failed <3 nights> running & we’re on it.',
            sourceIds: ['src-alert'],
          },
        ],
      },
      { kind: 'recommended', title: 'Recommended', lines: [] },
      {
        kind: 'questions',
        title: 'Your questions',
        lines: [
          {
            id: 'l2',
            question: 'Are we ready for the new surgery?',
            text: 'Yes, once the firewall is in.',
            sourceIds: ['src-quote', 'src-alert'],
          },
        ],
      },
    ],
    sources: [alert, quote],
  };
  const settings: StoredReportSettings = {
    senderName: 'Northwind IT',
    replyTo: 'help@northwind.example',
    brandColour: '#1f6feb',
    logo: { type: 'image/png', base64: 'iVBORw0KGgo=' },
    draftAt: null,
    sendAt: null,
    sendFrom: null,
  };
  const render = (
    overrides: Partial<Parameters<typeof renderReportEmail>[0]> = {},
  ) =>
    renderReportEmail({
      report,
      workspaceName: 'Northwind',
      timeZone: 'Europe/London',
      settings,
      sources: [alert, quote],
      logoSrc: 'cid:logo',
      ...overrides,
    });

  it('titles the email by the report and its week', () => {
    expect(render().subject).toBe(
      'Harbour Dental weekly report, 5–11 Oct 2026',
    );
  });

  it('brands the top, escapes every word, and leaves out empty sections', () => {
    const { html } = render();
    expect(html).toContain('<img src="cid:logo" alt="Northwind IT"');
    expect(html).toContain('border-top:4px solid #1f6feb');
    expect(html).toContain(
      'Backups failed &lt;3 nights&gt; running &amp; we’re on it.',
    );
    expect(html).not.toContain('<3 nights>');
    expect(html).not.toContain('Recommended');
    expect(html.indexOf('Needs attention')).toBeLessThan(
      html.indexOf('Your questions'),
    );
    // Without a logo, the sender's name stands in for it.
    expect(render({ logoSrc: null }).html).toContain(
      '<span style="font-size:16px;font-weight:600;color:#1f6feb;">Northwind IT</span>',
    );
    expect(render({ settings: null, logoSrc: null }).html).toContain(
      '>Northwind</span>',
    );
  });

  it('numbers sources by first citation, as footnotes that don’t link', () => {
    const { html, text } = render();
    expect(text).toContain(
      '- Backups failed <3 nights> running & we’re on it. [1]',
    );
    expect(text).toContain(
      '- Are we ready for the new surgery?\n  Yes, once the firewall is in. [2, 1]',
    );
    expect(text).toContain(
      '[1] NinjaOne alert ALERT-48213: Backups failed on HD-FS01, 7 Oct 2026',
    );
    expect(text).toContain(
      '[2] Fathom meeting “Quarterly review”, Priya Shah at 00:12:04, 6 Oct 2026',
    );
    expect(text).toContain(
      'Sent by Northwind IT. Reply to this email to reach us.',
    );
    expect(html).toContain(
      '<sup style="font-size:11px;color:#5f6670;">2, 1</sup>',
    );
    expect(html).not.toContain('ninjarmm.com');
  });

  it('writes week ranges across months and years', () => {
    expect(dateRange('2026-10-05', '2026-10-11')).toBe('5–11 Oct 2026');
    expect(dateRange('2026-09-28', '2026-10-04')).toBe('28 Sept – 4 Oct 2026');
    expect(dateRange('2026-12-28', '2027-01-03')).toBe(
      '28 Dec 2026 – 3 Jan 2027',
    );
  });
});
