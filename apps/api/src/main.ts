import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/configuration.js';
import { webhookAuthorized } from './notes/inbound-email.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  // Forwarded email arrives with its attachments, so Postmark's posts run
  // large. Only the inbound webhook takes them, and only once its token
  // checks out; everything else keeps the usual 100 KB limit.
  const inbound = config.get('inbound', { infer: true });
  app.use(
    '/inbound',
    (req: Request, res: Response, next: NextFunction) =>
      inbound && !webhookAuthorized(req.headers.authorization, inbound.token)
        ? res.status(401).end()
        : next(),
    json({ limit: '40mb' }),
  );
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });

  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });
  // Lets DatabaseModule close connections on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
