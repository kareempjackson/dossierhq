import 'server-only';
import { cookies, headers as requestHeaders } from 'next/headers';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { env } from './env';
import { PATH_HEADER, SESSION_COOKIE, signInPath } from './session';

/**
 * Low-level HTTP client for the API's /admin routes. Server-only: pages and
 * Server Actions reach the API through lib/data, never the browser. Every
 * request carries ADMIN_API_KEY, and the staff session's token; a 401 sends
 * the person back to sign in. Responses are parsed with the contract schemas.
 */

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
    /** What the API said went wrong, in plain words, when it says. */
    readonly problem?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type Options = {
  body?: unknown;
  /**
   * - `required` (default): send the session token; a missing or rejected
   *   session redirects to sign-in.
   * - `best-effort`: send it if there is one, and throw ApiError(401) rather
   *   than redirect, for sign-out.
   * - `none`: for requests made before there is a session, like sign-in.
   */
  session?: 'required' | 'best-effort' | 'none';
};

async function call(
  method: Method,
  path: string,
  { body, session = 'required' }: Options = {},
): Promise<Response> {
  // Read first: it's what makes every page that reads the API render per
  // request, rather than once at build with whatever happened then.
  const cookieStore = await cookies();
  if (!env.ADMIN_API_KEY) {
    throw new Error(
      'Set ADMIN_API_KEY in apps/admin/.env.local to the API’s ADMIN_API_KEY.',
    );
  }
  const headers: Record<string, string> = {
    ...(await clientIpHeaders()),
    'x-dossier-admin-key': env.ADMIN_API_KEY,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session !== 'none') {
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) {
      if (session === 'required') redirect('/sign-in');
      throw new ApiError(401, `${method} ${path} needs a session`);
    }
    headers.authorization = `Bearer ${token}`;
  }

  const res = await fetch(new URL(path, env.API_URL), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 && session === 'required') {
    const next = (await requestHeaders()).get(PATH_HEADER);
    redirect(signInPath({ expired: true, next }));
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `${method} ${path} failed with ${res.status}`,
      await problemOf(res),
    );
  }
  return res;
}

/**
 * The visitor's address, vouched for with CLIENT_IP_KEY, since the API only
 * ever sees this server: the last address in x-forwarded-for.
 */
async function clientIpHeaders(): Promise<Record<string, string>> {
  if (!env.CLIENT_IP_KEY) return {};
  const ip = (await requestHeaders())
    .get('x-forwarded-for')
    ?.split(',')
    .at(-1)
    ?.trim();
  return ip
    ? {
        'x-dossier-client-ip': ip,
        'x-dossier-client-ip-key': env.CLIENT_IP_KEY,
      }
    : {};
}

/** The API's own explanation, when it gave one in words. */
async function problemOf(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as {
      message?: unknown;
      errors?: { message?: unknown }[];
    } | null;
    const first = body?.errors?.[0]?.message;
    if (body?.message === 'Validation failed' && typeof first === 'string') {
      return first;
    }
    return typeof body?.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

/** GET and parse. Throws ApiError on any non-2xx response. */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  options: Pick<Options, 'session'> = {},
): Promise<T> {
  return schema.parse(await (await call('GET', path, options)).json());
}

/** GET and parse, or null when the API answers 404. */
export async function apiFind<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    return await apiGet(path, schema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Sends a JSON body, then parses the response (if a schema is given). */
export async function apiSend<T = void>(
  method: Exclude<Method, 'GET'>,
  path: string,
  body?: unknown,
  schema?: z.ZodType<T>,
  options: Pick<Options, 'session'> = {},
): Promise<T> {
  const res = await call(method, path, { ...options, body });
  return (schema ? schema.parse(await res.json()) : undefined) as T;
}

/** Builds `path?key=value` from the defined values only. */
export function withQuery(
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
