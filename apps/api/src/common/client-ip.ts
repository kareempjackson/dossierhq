import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import { isIP } from 'node:net';
import { sameSecret } from './same-secret.js';
import type { AuthenticatedRequest } from './workspace.js';

/** The visitor's address, as the web app passes it on. */
export const CLIENT_IP_HEADER = 'x-dossier-client-ip';
/** CLIENT_IP_KEY, proving the address came from the web app. */
export const CLIENT_IP_KEY_HEADER = 'x-dossier-client-ip-key';

/**
 * The visitor's address, or null when it can't be trusted. The browser never
 * reaches the API; requests come from the web app's server, whose own address
 * says nothing about who is signing in. So the API takes the address the web
 * app passes on, and only with CLIENT_IP_KEY beside it.
 */
export function trustedClientIp(
  headers: IncomingHttpHeaders,
  key: string | undefined,
): string | null {
  const ip = headers[CLIENT_IP_HEADER];
  const given = headers[CLIENT_IP_KEY_HEADER];
  if (!key || typeof ip !== 'string' || typeof given !== 'string') return null;
  if (!sameSecret(given, key)) return null;
  const address = ip.trim();
  return isIP(address) ? address : null;
}

/** The visitor's trusted address, or null. Set by AuthGuard on every request. */
export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().clientIp ?? null,
);
