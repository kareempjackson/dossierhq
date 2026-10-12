import 'server-only';
import type { z } from 'zod';
import { env } from './env';

/**
 * Low-level HTTP client for the NestJS API. Server-only: pages and Server
 * Actions reach the API through lib/data, never the browser. Every response is
 * parsed with the contract schema the API is built on.
 */

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH';

async function call(
  method: Method,
  path: string,
  body?: unknown,
): Promise<Response> {
  const res = await fetch(new URL(path, env.API_URL), {
    method,
    headers:
      body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `${method} ${path} failed with ${res.status}`,
    );
  }
  return res;
}

/** GET and parse. Throws ApiError on any non-2xx response. */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return schema.parse(await (await call('GET', path)).json());
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

/** POST or PATCH a JSON body, then parse the response (if a schema is given). */
export async function apiSend<T = void>(
  method: Exclude<Method, 'GET'>,
  path: string,
  body?: unknown,
  schema?: z.ZodType<T>,
): Promise<T> {
  const res = await call(method, path, body);
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
