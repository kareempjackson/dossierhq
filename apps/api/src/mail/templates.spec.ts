import { renderNotificationEmail } from '../notifications/email.js';
import { escape } from './layout.js';
import { DOSSIER_LOGO, DOSSIER_LOGO_SRC } from './logo.js';
import { signUpEmail, workspaceInviteEmail } from './templates.js';

describe('Dossier emails', () => {
  it('carries the link as a button and spelled out, with the logo inline', () => {
    const email = signUpEmail({
      email: 'sam@larkspur-it.example',
      link: 'https://dossier.test/verify-email?token=abc',
      hours: 24,
    });
    expect(email.html).toContain('>Confirm email</a>');
    expect(
      email.html.match(
        /href="https:\/\/dossier\.test\/verify-email\?token=abc"/g,
      ),
    ).toHaveLength(2);
    expect(email.html).toContain(`src="${DOSSIER_LOGO_SRC}"`);
    expect(email.attachments).toEqual([DOSSIER_LOGO]);
    expect(email.html).toContain('The link works for 24 hours.');
    expect(email.text).toContain('https://dossier.test/verify-email?token=abc');
  });

  it('escapes what people type', () => {
    const email = workspaceInviteEmail({
      inviter: 'Sam <script>',
      workspace: 'Larkspur & Co',
      role: 'a technician',
      link: 'https://dossier.test/invite?token=abc',
      days: 7,
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain(
      escape('Sam <script> invited you to Larkspur & Co.'),
    );
  });

  it('names the tool to reconnect, and leaves the button out without a link', () => {
    const site = {
      workspaceName: 'Larkspur IT',
      webUrl: 'https://dossier.test',
    };
    const failing = renderNotificationEmail(
      {
        type: 'connection.failing',
        title: 'Fathom has stopped syncing',
        body: 'Its key expired.',
        link: '/connections',
      },
      site,
    );
    expect(failing.html).toContain('>Reconnect Fathom</a>');
    expect(failing.html).toContain('>Sync stopped</p>');
    const locked = renderNotificationEmail(
      {
        type: 'security.locked-out',
        title: 'Signing in to your account is paused',
        body: 'Wait a while.',
        link: null,
      },
      site,
    );
    expect(locked.html).not.toContain('If the button doesn’t work');
  });
});
