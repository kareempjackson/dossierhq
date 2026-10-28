import { z } from 'zod';

export type Fetch = typeof fetch;

export type ToolErrorKind =
  | 'credentials'
  | 'permission'
  | 'not-found'
  | 'unreachable'
  | 'rate-limited'
  | 'unexpected';

/** A problem talking to a tool, in words a person can act on. */
export class ToolError extends Error {
  override readonly name = 'ToolError';

  constructor(
    readonly kind: ToolErrorKind,
    message: string,
    /** What the tool actually said, for the sync log. */
    readonly detail?: string,
  ) {
    super(message);
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** What is being read, for messages, e.g. "the device list". */
  what: string;
  /** Replaces the default error for a status, e.g. 400 at a token endpoint. */
  errors?: Partial<Record<number, ToolError>>;
};

export type HttpOptions = {
  fetch?: Fetch;
  timeoutMs?: number;
  /** Attempts in all, for throttling and gateway errors. */
  attempts?: number;
  /** Longest wait Dossier accepts from Retry-After before giving up. */
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Refuses anything but GET, for a tool whose keys can't be made read-only. */
  getOnly?: boolean;
};

const USER_AGENT = 'Dossier/0.1 (read-only sync)';
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

/**
 * fetch for one tool: JSON in and out, a timeout on every request, waits out
 * throttling (honouring Retry-After), and turns failures into ToolErrors.
 */
export class ToolHttp {
  private readonly fetch: Fetch;
  private readonly timeoutMs: number;
  private readonly attempts: number;
  private readonly maxWaitMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly getOnlyMode: boolean;

  constructor(
    private readonly toolName: string,
    private readonly options: HttpOptions = {},
  ) {
    this.fetch = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.attempts = options.attempts ?? 4;
    this.maxWaitMs = options.maxWaitMs ?? 60_000;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.getOnlyMode = options.getOnly ?? false;
  }

  /** The same, but it throws before sending anything other than a GET. */
  getOnly(): ToolHttp {
    return new ToolHttp(this.toolName, { ...this.options, getOnly: true });
  }

  /** Requests and parses JSON with `schema`. */
  async json<T>(
    url: string,
    schema: z.ZodType<T>,
    options: RequestOptions,
  ): Promise<T> {
    const response = await this.request(url, options);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw this.unexpected(options.what, 'The response was not JSON.');
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw this.unexpected(
        options.what,
        `${z.prettifyError(parsed.error)}${keysOf(body)}`,
      );
    }
    return parsed.data;
  }

  async request(url: string, options: RequestOptions): Promise<Response> {
    const method = options.method ?? 'GET';
    if (this.getOnlyMode && method !== 'GET') {
      throw new Error(
        `Dossier only reads from ${this.toolName}, so it won’t send a ${method}.`,
      );
    }
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetch(url, {
          method,
          headers: {
            accept: 'application/json',
            'user-agent': USER_AGENT,
            ...options.headers,
          },
          body: options.body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (attempt < Math.min(this.attempts, 3)) {
          await this.sleep(backoff(attempt));
          continue;
        }
        throw new ToolError(
          'unreachable',
          `Dossier couldn’t reach ${this.toolName}.`,
          (error as Error).message,
        );
      }

      if (response.ok) return response;

      if (RETRY_STATUSES.has(response.status) && attempt < this.attempts) {
        const wait = retryAfter(response) ?? backoff(attempt);
        if (wait <= this.maxWaitMs) {
          await response.body?.cancel();
          await this.sleep(wait);
          continue;
        }
      }

      const detail = (await response.text().catch(() => '')).slice(0, 500);
      const custom = options.errors?.[response.status];
      if (custom) {
        throw new ToolError(custom.kind, custom.message, detail || undefined);
      }
      throw this.statusError(response.status, options.what, detail);
    }
  }

  private statusError(status: number, what: string, detail: string) {
    const tool = this.toolName;
    const withDetail = (kind: ToolErrorKind, message: string) =>
      new ToolError(
        kind,
        message,
        `HTTP ${status}${detail ? `: ${detail}` : ''}`,
      );
    switch (status) {
      case 401:
        return withDetail(
          'credentials',
          `${tool} turned down the credentials Dossier uses.`,
        );
      case 403:
        return withDetail(
          'permission',
          `${tool} accepted the credentials, but they aren’t allowed to read ${what}.`,
        );
      case 404:
        return withDetail('not-found', `${tool} couldn’t find ${what}.`);
      case 429:
        return withDetail(
          'rate-limited',
          `${tool} is limiting how often Dossier can read. The next sync will try again.`,
        );
      default:
        return withDetail(
          'unexpected',
          `${tool} answered with an error (${status}) when Dossier asked for ${what}.`,
        );
    }
  }

  private unexpected(what: string, detail: string) {
    return new ToolError(
      'unexpected',
      `${this.toolName} sent ${what} in a form Dossier didn’t expect.`,
      detail.slice(0, 500),
    );
  }
}

const backoff = (attempt: number) => 1000 * 2 ** (attempt - 1);

/** An object reply's top-level key names (never values), so its shape shows in the sync log. */
function keysOf(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const keys = Object.keys(body);
  return ` (top-level keys: ${keys.slice(0, 12).join(', ') || 'none'})`;
}

/** Retry-After as milliseconds, from seconds or an HTTP date. */
function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
