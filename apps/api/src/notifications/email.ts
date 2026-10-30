import { escape, type RenderedEmail } from '../delivery/report-email.js';
import type { Described } from './describe.js';

const MUTED = '#5f6670';
const INK = '#1f2328';
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/**
 * A notification as an email: what happened, a button to the page about
 * it, and where to choose which emails Dossier sends.
 */
export function renderNotificationEmail(
  described: Described,
  { workspaceName, webUrl }: { workspaceName: string; webUrl: string },
): RenderedEmail {
  const link = described.link ? new URL(described.link, webUrl).href : null;
  const settings = new URL('/settings#notifications', webUrl).href;
  const footer = `You get this as part of ${workspaceName} on Dossier. Choose what Dossier emails you in Settings: ${settings}`;

  const text = [
    described.title,
    ...(described.body ? ['', described.body] : []),
    ...(link ? ['', `Open in Dossier: ${link}`] : []),
    '',
    '—',
    footer,
  ].join('\n');

  const button = link
    ? `<p style="margin:20px 0 0;"><a href="${escape(link)}" style="display:inline-block;padding:9px 16px;border-radius:6px;background:${INK};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Open in Dossier</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f5f6f7;font-family:${FONT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;"><tr><td style="padding:28px 32px;"><h1 style="margin:0;font-size:18px;line-height:1.35;color:${INK};">${escape(described.title)}</h1>${described.body ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.55;color:${INK};">${escape(described.body)}</p>` : ''}${button}</td></tr><tr><td style="padding:16px 32px 24px;border-top:1px solid #e6e7e9;font-size:12px;line-height:1.5;color:${MUTED};">You get this as part of ${escape(workspaceName)} on Dossier. <a href="${escape(settings)}" style="color:${MUTED};">Choose what Dossier emails you</a>.</td></tr></table></td></tr></table></body></html>`;

  return { subject: described.title, text, html };
}
