import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { createMailer, MAILER } from './mailer.js';

/**
 * The only place the API learns how it sends email. Features inject MAILER;
 * switching MAIL_PROVIDER needs no code changes anywhere else.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const mailer = createMailer(config.get('mail', { infer: true }));
        const logger = new Logger(MailModule.name);
        if (
          mailer.provider === 'log' &&
          process.env.NODE_ENV === 'production'
        ) {
          logger.warn(
            'MAIL_PROVIDER is "log": password resets and invites go to this log, not to anyone’s inbox.',
          );
        } else {
          logger.log(`Sending email with "${mailer.provider}"`);
        }
        return mailer;
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
