import { validateConfig } from '../config/configuration.js';
import { LogMailer, MailError, PostmarkMailer } from './mailer.js';

const MESSAGE = {
  to: ['ann@harbourdental.example', 'bo@harbourdental.example'],
  subject: 'Reset your Dossier password',
  text: 'Open this link: https://dossier.test/reset-password?token=t',
  tag: 'password-reset',
};

/** A fetch that answers like Postmark, and keeps what it was sent. */
function fakePostmark(status: number, reply: unknown) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: URL, init: RequestInit) => {
    sent.push({ url: String(url), init });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent };
}

describe('PostmarkMailer', () => {
  const mailer = (fetch: typeof globalThis.fetch) =>
    new PostmarkMailer({
      token: 'server-token',
      from: 'Larkspur IT <reports@larkspur-it.example>',
      baseUrl: 'https://postmark.test',
      fetch,
    });

  it('sends on the transactional stream without tracking', async () => {
    const postmark = fakePostmark(200, {
      ErrorCode: 0,
      Message: 'OK',
      MessageID: 'pm-1',
    });
    await expect(mailer(postmark.fetch).send(MESSAGE)).resolves.toEqual({
      id: 'pm-1',
    });

    const [{ url, init }] = postmark.sent as [(typeof postmark.sent)[0]];
    expect(url).toBe('https://postmark.test/email');
    expect(init.headers).toMatchObject({
      'x-postmark-server-token': 'server-token',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      From: 'Larkspur IT <reports@larkspur-it.example>',
      To: 'ann@harbourdental.example, bo@harbourdental.example',
      Subject: MESSAGE.subject,
      TextBody: MESSAGE.text,
      Tag: 'password-reset',
      MessageStream: 'outbound',
      TrackOpens: false,
      TrackLinks: 'None',
    });
  });

  it('says what to fix when Postmark refuses', async () => {
    const refused = (code: number, message: string) =>
      mailer(
        fakePostmark(422, { ErrorCode: code, Message: message }).fetch,
      ).send(MESSAGE);
    await expect(refused(400, 'Sender signature not found')).rejects.toThrow(
      'Add MAIL_FROM as a sender signature in Postmark',
    );
    await expect(refused(406, 'Inactive recipient')).rejects.toThrow(
      'Postmark won’t send to it',
    );
    // Codes without a translation pass on Postmark's own words.
    await expect(refused(300, 'Invalid email request')).rejects.toThrow(
      'Postmark didn’t send the email (Invalid email request).',
    );
    await expect(
      mailer(fakePostmark(500, 'Bad gateway').fetch).send(MESSAGE),
    ).rejects.toThrow('(HTTP 500)');
  });

  it('says when Postmark can’t be reached', async () => {
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const failure = await mailer(offline)
      .send(MESSAGE)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MailError);
    expect((failure as MailError).message).toBe(
      'Couldn’t reach Postmark to send the email.',
    );
  });
});

describe('LogMailer', () => {
  it('keeps what it would have sent', async () => {
    const mailer = new LogMailer('Dossier <dossier@localhost>');
    const { id } = await mailer.send(MESSAGE);
    expect(mailer.outbox).toEqual([
      { ...MESSAGE, id, from: 'Dossier <dossier@localhost>' },
    ]);
  });
});

describe('mail config', () => {
  const env = (mail: Record<string, string>) =>
    validateConfig({ DATABASE_PROVIDER: 'memory', ...mail });

  it('logs by default and needs a sender and token for Postmark', () => {
    expect(env({}).mail).toEqual({
      provider: 'log',
      from: 'Dossier <dossier@localhost>',
    });
    expect(() => env({ MAIL_PROVIDER: 'postmark' })).toThrow(
      'MAIL_PROVIDER=postmark needs MAIL_FROM and POSTMARK_SERVER_TOKEN',
    );
    expect(
      env({
        MAIL_PROVIDER: 'postmark',
        MAIL_FROM: 'Dossier <reports@larkspur-it.example>',
        POSTMARK_SERVER_TOKEN: ' token ',
      }).mail,
    ).toEqual({
      provider: 'postmark',
      from: 'Dossier <reports@larkspur-it.example>',
      token: 'token',
      baseUrl: undefined,
    });
  });
});
