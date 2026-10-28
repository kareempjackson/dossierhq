import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const MAIL_PROVIDERS = ['log', 'postmark'] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

/** One email. Every email has a plain-text body; HTML is optional. */
export type MailMessage = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** What kind of email, for the provider's reports, e.g. "password-reset". */
  tag?: string;
};

export type SentMail = MailMessage & { id: string; from: string };

/** Why an email wasn't sent, in words a person can act on. */
export class MailError extends Error {
  override readonly name = 'MailError';
}

/** Sends email: Postmark, or the log in development and tests. */
export interface Mailer {
  readonly provider: MailProvider;
  /** Resolves with the provider's message ID once the provider accepts it. */
  send(message: MailMessage): Promise<{ id: string }>;
}

/** Injection token for the Mailer (tests read the log one's outbox). */
export const MAILER = Symbol('MAILER');

/**
 * Sends nothing: writes each email to the API's log and keeps the latest in
 * `outbox`, so development shows reset links and tests can read them.
 */
export class LogMailer implements Mailer {
  readonly provider = 'log';
  readonly outbox: SentMail[] = [];
  private readonly logger = new Logger('Mail');

  constructor(private readonly from: string) {}

  async send(message: MailMessage): Promise<{ id: string }> {
    const sent = { ...message, id: `log-${randomUUID()}`, from: this.from };
    this.outbox.push(sent);
    if (this.outbox.length > 100) this.outbox.shift();
    this.logger.log(
      `Not sent (MAIL_PROVIDER=log). To ${message.to.join(', ')}: ${message.subject}\n${message.text}`,
    );
    return { id: sent.id };
  }
}

const postmarkReply = z.object({
  ErrorCode: z.number(),
  Message: z.string(),
  MessageID: z.string().optional(),
});

/** Postmark's error codes that mean something to fix, in plain words. */
const POSTMARK_PROBLEMS: Record<number, string> = {
  10: 'Postmark rejected the server token. Check POSTMARK_SERVER_TOKEN.',
  400: 'Postmark doesn’t know the sender. Add MAIL_FROM as a sender signature in Postmark.',
  401: 'The sender isn’t confirmed in Postmark yet. Confirm MAIL_FROM’s sender signature.',
  406: 'This address has bounced or marked Dossier’s email as spam before, so Postmark won’t send to it.',
};

export type PostmarkOptions = {
  token: string;
  from: string;
  /** For tests; defaults to Postmark's API. */
  baseUrl?: string;
  fetch?: typeof fetch;
};

/** Sends through Postmark's transactional stream, without tracking. */
export class PostmarkMailer implements Mailer {
  readonly provider = 'postmark';
  private readonly fetch: typeof fetch;
  private readonly url: URL;

  constructor(private readonly options: PostmarkOptions) {
    this.fetch = options.fetch ?? fetch;
    this.url = new URL(
      '/email',
      options.baseUrl ?? 'https://api.postmarkapp.com',
    );
  }

  async send(message: MailMessage): Promise<{ id: string }> {
    let res: Response;
    try {
      res = await this.fetch(this.url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-postmark-server-token': this.options.token,
        },
        body: JSON.stringify({
          From: this.options.from,
          To: message.to.join(', '),
          Subject: message.subject,
          TextBody: message.text,
          HtmlBody: message.html,
          ReplyTo: message.replyTo,
          Tag: message.tag,
          MessageStream: 'outbound',
          TrackOpens: false,
          TrackLinks: 'None',
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new MailError('Couldn’t reach Postmark to send the email.');
    }
    const reply = postmarkReply.safeParse(await res.json().catch(() => null));
    if (res.ok && reply.success && reply.data.ErrorCode === 0) {
      return { id: reply.data.MessageID ?? '' };
    }
    const code = reply.success ? reply.data.ErrorCode : -1;
    throw new MailError(
      POSTMARK_PROBLEMS[code] ??
        `Postmark didn’t send the email (${reply.success ? reply.data.Message : `HTTP ${res.status}`}).`,
    );
  }
}

export type MailConfig =
  | { provider: 'log'; from: string }
  | { provider: 'postmark'; from: string; token: string; baseUrl?: string };

export function createMailer(config: MailConfig): Mailer {
  switch (config.provider) {
    case 'log':
      return new LogMailer(config.from);
    case 'postmark':
      return new PostmarkMailer(config);
  }
}
