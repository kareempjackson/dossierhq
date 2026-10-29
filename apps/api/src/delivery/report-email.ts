import {
  DEFAULT_BRAND_COLOUR,
  TOOL_NAMES,
  type Report,
  type ReportLine,
  type Source,
} from '@dossierhq/contracts';
import type { StoredReportSettings } from '@dossierhq/database';

export type ReportEmailInput = {
  report: Report;
  workspaceName: string;
  timeZone: string;
  settings: StoredReportSettings | null;
  /** Every record the report cites, as it cites them. */
  sources: Source[];
  /** Where the logo comes from: `cid:logo` in a sent email, a data URL in a preview. */
  logoSrc: string | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const MUTED = '#5f6670';
const INK = '#1f2328';
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/**
 * A report as the email its client gets: the sender's branding at the top,
 * the at-a-glance figures, each section in the report's order (needs
 * attention first), and the records it rests on as numbered footnotes.
 * Footnotes name records rather than link them: the tools are the MSP's,
 * not the client's. Sections with nothing in them are left out.
 */
export function renderReportEmail(input: ReportEmailInput): RenderedEmail {
  const { report, settings } = input;
  const sender = settings?.senderName || input.workspaceName;
  const colour = settings?.brandColour ?? DEFAULT_BRAND_COLOUR;
  const range = dateRange(report.weekStart, report.weekEnd);
  const subject = `${report.title}, ${range}`;

  // Numbered by first citation, like the report page.
  const known = new Map(input.sources.map((source) => [source.id, source]));
  const numbered: Source[] = [];
  const number = new Map<string, number>();
  for (const id of report.sections.flatMap((s) =>
    s.lines.flatMap((l) => l.sourceIds),
  )) {
    const source = known.get(id);
    if (source && !number.has(id)) {
      numbered.push(source);
      number.set(id, numbered.length);
    }
  }
  const marks = (line: ReportLine) =>
    line.sourceIds.flatMap((id) => number.get(id) ?? []);
  const sections = report.sections.filter((s) => s.lines.length > 0);

  const text = [
    report.title,
    range,
    '',
    report.glance
      .map(
        (item) =>
          `${item.label}: ${item.value}${item.note ? ` (${item.note})` : ''}`,
      )
      .join(' · '),
    ...sections.flatMap((section) => [
      '',
      section.title.toUpperCase(),
      ...section.lines.map((line) => {
        const cited = marks(line);
        const refs = cited.length ? ` [${cited.join(', ')}]` : '';
        return line.question
          ? `- ${line.question}\n  ${line.text}${refs}`
          : `- ${line.text}${refs}`;
      }),
    ]),
    ...(numbered.length > 0
      ? [
          '',
          'SOURCES',
          ...numbered.map(
            (source, index) =>
              `[${index + 1}] ${sourceLabel(source, input.timeZone)}`,
          ),
        ]
      : []),
    '',
    `Sent by ${sender}.${settings?.replyTo ? ' Reply to this email to reach us.' : ''}`,
  ].join('\n');

  const header = input.logoSrc
    ? `<img src="${escape(input.logoSrc)}" alt="${escape(sender)}" height="40" style="display:block;height:40px;max-width:240px;width:auto;border:0;">`
    : `<span style="font-size:16px;font-weight:600;color:${colour};">${escape(sender)}</span>`;

  const glance =
    report.glance.length === 0
      ? ''
      : row(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:4px;"><tr>${report.glance
            .map(
              (item) =>
                `<td valign="top" style="padding:10px 12px;background:#f5f6f7;border-radius:6px;"><div style="font-size:12px;color:${MUTED};">${escape(item.label)}</div><div style="margin-top:2px;font-size:18px;font-weight:600;color:${INK};">${escape(item.value)}</div>${item.note ? `<div style="font-size:12px;color:${MUTED};">${escape(item.note)}</div>` : ''}</td>`,
            )
            .join('')}</tr></table>`,
          '16px 28px 0',
        );

  const body = sections
    .map((section) =>
      row(
        `<h2 style="margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${colour};">${escape(section.title)}</h2>${section.lines
          .map((line) => {
            const cited = marks(line);
            const refs = cited.length
              ? ` <sup style="font-size:11px;color:${MUTED};">${cited.join(', ')}</sup>`
              : '';
            const question = line.question
              ? `<strong style="color:${INK};">${escape(line.question)}</strong><br>`
              : '';
            return `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:${INK};">${question}${escape(line.text)}${refs}</p>`;
          })
          .join('')}`,
        '24px 32px 0',
      ),
    )
    .join('');

  const footnotes =
    numbered.length === 0
      ? ''
      : row(
          `<div style="border-top:1px solid #e6e7e9;padding-top:16px;"><h2 style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">Sources</h2><ol style="margin:0;padding-left:20px;font-size:12px;line-height:1.5;color:${MUTED};">${numbered
            .map(
              (source) =>
                `<li>${escape(sourceLabel(source, input.timeZone))}</li>`,
            )
            .join('')}</ol></div>`,
          '28px 32px 0',
        );

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f2f2ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2ef;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-top:4px solid ${colour};border-radius:8px;font-family:${FONT};color:${INK};">
${row(header, '24px 32px 0')}
${row(`<h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:${INK};">${escape(report.title)}</h1><p style="margin:6px 0 0;font-size:13px;color:${MUTED};">${escape(range)}</p>`, '18px 32px 0')}
${glance}
${body}
${footnotes}
${row(`<p style="margin:0;font-size:12px;color:${MUTED};">Sent by ${escape(sender)}.${settings?.replyTo ? ' Reply to this email to reach us.' : ''}</p>`, '24px 32px 28px')}
</table>
</td></tr>
</table>
</body>
</html>
`;
  return { subject, html, text };
}

const row = (content: string, padding: string) =>
  `<tr><td style="padding:${padding};">${content}</td></tr>`;

/** "NinjaOne alert ALERT-48213: Disk space low on HD-FS01, 6 Oct 2026". */
function sourceLabel(source: Source, timeZone: string): string {
  const on = day(source.recordedAt, timeZone);
  switch (source.kind) {
    case 'meeting':
      return `${TOOL_NAMES[source.tool]} meeting “${source.title}”, ${source.speakerName} at ${source.transcriptAt}, ${on}`;
    case 'note':
      // Notes are dated by the day of the meeting, not a moment.
      return `Meeting notes “${source.title}”, ${day(source.recordedAt, 'UTC')}`;
    case 'record':
      return `${TOOL_NAMES[source.tool]} ${source.recordType.toLowerCase()} ${source.recordId}: ${source.title}, ${on}`;
  }
}

const day = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  });

/** "6–12 Oct 2026", "29 Sep – 5 Oct 2026", "29 Dec 2025 – 4 Jan 2026". */
export function dateRange(start: string, end: string): string {
  const [from, to] = [start, end].map((d) => new Date(`${d}T00:00:00Z`)) as [
    Date,
    Date,
  ];
  const format = (date: Date, parts: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString('en-GB', { ...parts, timeZone: 'UTC' });
  const full = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  if (from.getUTCFullYear() !== to.getUTCFullYear()) {
    return `${format(from, full)} – ${format(to, full)}`;
  }
  if (from.getUTCMonth() !== to.getUTCMonth()) {
    return `${format(from, { day: 'numeric', month: 'short' })} – ${format(to, full)}`;
  }
  return `${from.getUTCDate()}–${format(to, full)}`;
}

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
