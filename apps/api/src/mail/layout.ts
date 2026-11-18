import { DOSSIER_LOGO_SRC } from './logo.js';

/**
 * Dossier's email layout: a white card on warm grey with a deep band along
 * the top, the logo, a small label, a headline, a few lines, one button with
 * the file tab raised along its top, the link spelled out for when the button
 * doesn't work, and why the email came. Tables and inline styles, so it holds
 * up in Outlook and Gmail; fonts fall back to the system's.
 */

export type EmailAction = {
  label: string;
  url: string;
  /** Lime for getting in (confirm, join, reset); ink for everything else. */
  tone: 'act' | 'ink';
};

export type EmailContent = {
  /** The small label over the headline, e.g. "Confirm your email". */
  eyebrow: string;
  title: string;
  /** Plain text; each one a paragraph. */
  paragraphs: string[];
  action?: EmailAction;
  /** Small links under the button, e.g. "Forgotten your password? Reset it". */
  links?: { lead: string; label: string; url: string }[];
  /** Why this email came, at the foot. */
  reason: string;
  reasonLink?: { label: string; url: string };
  /** What inboxes show beside the subject; the first paragraph if left out. */
  preview?: string;
};

const COLOUR = {
  ground: '#f1efea',
  card: '#ffffff',
  band: '#002e3b',
  ink: '#13232a',
  text: '#4d5551',
  muted: '#6b706c',
  quiet: '#767b77',
  lime: '#e8f54c',
};
const DISPLAY =
  "'Bricolage Grotesque', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SANS =
  "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Who sends Dossier's email, at the foot of every one. */
const SENDER = 'Ghost Savvy · Lagos';

export function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** A pill with the file tab: a 3px bar over the pill, from 22px in to where its end curves. */
function button({ label, url, tone }: EmailAction): string {
  const fill = tone === 'act' ? COLOUR.lime : COLOUR.ink;
  const text = tone === 'act' ? COLOUR.ink : '#ffffff';
  const gap =
    '<td width="22" style="width:22px;font-size:0;line-height:0;">&nbsp;</td>';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
<tr>${gap}<td height="3" bgcolor="${fill}" style="height:3px;font-size:0;line-height:0;mso-line-height-rule:exactly;background:${fill};border-radius:4px 4px 0 0;">&nbsp;</td>${gap}</tr>
<tr><td colspan="3" bgcolor="${fill}" style="background:${fill};border-radius:999px;"><a href="${escape(url)}" style="display:inline-block;padding:13px 36px;font-family:${SANS};font-size:15px;font-weight:500;line-height:20px;color:${text};text-decoration:none;border-radius:999px;">${escape(label)}</a></td></tr>
</table>`;
}

export function renderLayout(content: EmailContent): string {
  const preview = content.preview ?? content.paragraphs[0] ?? content.title;
  const paragraphs = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:16px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${COLOUR.text};">${escape(paragraph)}</p>`,
    )
    .join('');
  const action = content.action
    ? `<tr><td class="pad" style="padding:40px 48px 0;">${button(content.action)}</td></tr>
<tr><td class="pad" style="padding:28px 48px 0;font-family:${SANS};font-size:12px;line-height:1.6;color:${COLOUR.quiet};">If the button doesn’t work, paste this link into your browser:<br><a href="${escape(content.action.url)}" style="color:${COLOUR.quiet};text-decoration:underline;word-break:break-all;">${escape(content.action.url)}</a></td></tr>`
    : '';
  const links = content.links?.length
    ? `<tr><td class="pad" style="padding:20px 48px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${COLOUR.muted};">${content.links
        .map(
          (link) =>
            `${escape(link.lead)} <a href="${escape(link.url)}" style="color:${COLOUR.ink};text-decoration:underline;">${escape(link.label)}</a>`,
        )
        .join('<br>')}</td></tr>`
    : '';
  const reasonLink = content.reasonLink
    ? ` <a href="${escape(content.reasonLink.url)}" style="color:${COLOUR.quiet};text-decoration:underline;">${escape(content.reasonLink.label)}</a>.`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escape(content.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400&family=Geist:wght@400;500&display=swap" rel="stylesheet">
<style>
  @media (max-width: 600px) {
    .pad { padding-left: 24px !important; padding-right: 24px !important; }
    .title { font-size: 23px !important; }
    .outer { padding: 16px 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLOUR.ground};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escape(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOUR.ground}" style="background:${COLOUR.ground};">
<tr><td class="outer" align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOUR.card}" style="max-width:560px;background:${COLOUR.card};border-radius:12px;border-top:4px solid ${COLOUR.band};">
<tr><td class="pad" style="padding:40px 48px 0;"><img src="${DOSSIER_LOGO_SRC}" width="104" height="26" alt="Dossier" style="display:block;width:104px;height:26px;border:0;"></td></tr>
<tr><td class="pad" style="padding:48px 48px 0;">
<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.4;color:${COLOUR.muted};">${escape(content.eyebrow)}</p>
<h1 class="title" style="margin:10px 0 0;font-family:${DISPLAY};font-size:27px;font-weight:400;line-height:1.25;letter-spacing:-0.02em;color:${COLOUR.ink};">${escape(content.title)}</h1>
${paragraphs}
</td></tr>
${action}
${links}
<tr><td class="pad" style="padding:56px 48px 36px;font-family:${SANS};font-size:12px;line-height:1.6;color:${COLOUR.quiet};">${escape(content.reason)}${reasonLink} <span style="white-space:nowrap;">${escape(SENDER)}</span></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
