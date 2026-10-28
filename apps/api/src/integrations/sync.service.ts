import {
  connectorCredentialsSchema,
  ninjaOneSignInSchema,
  TOOL_NAMES,
  unattachedMeetingSchema,
  type AttentionItem,
  type AuditEntry,
  type Connector,
  type ConnectorCredentials,
  type MeetingAttachments,
  type NinjaOneSignIn,
  type NinjaOneSignInFinish,
  type NinjaOneSignInStart,
  type RecordSource,
  type Tool,
} from '@dossierhq/contracts';
import type {
  ConnectorRecord,
  DatabaseAdapter,
  ToolRecords,
} from '@dossierhq/database';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import type { SyncContext, ToolConnector } from './connector.js';
import { ClientDirectory } from './directory.js';
import { ToolError, ToolHttp, type HttpOptions } from './http.js';
import { DAY_MS, oneLine, stableHash } from './ids.js';
import { Secrets } from './secrets.js';
import type { NinjaOneConnector } from './tools/ninjaone.js';

/** Injection tokens: the connectors by tool, and fetch settings (tests swap these). */
export const CONNECTORS = Symbol('CONNECTORS');
export const HTTP_OPTIONS = Symbol('HTTP_OPTIONS');

/** How long the audit log keeps reads. */
const AUDIT_DAYS = 90;

/** How long someone has to sign in to NinjaOne and come back. */
const SIGN_IN_MINUTES = 10;

/** A NinjaOne sign-in in progress, sealed while the person is at NinjaOne. */
const pendingSignInSchema = z.object({
  kind: z.literal('ninjaone-sign-in'),
  workspaceId: z.string(),
  app: ninjaOneSignInSchema,
  state: z.string(),
  /** For an app with no secret. */
  pkce: z.object({ challenge: z.string(), verifier: z.string() }).optional(),
  expiresAt: z.number(),
});
type PendingSignIn = z.infer<typeof pendingSignInSchema>;

/** The tool meetings come from. */
const MEETINGS_TOOL = 'fathom' satisfies Tool;

/**
 * How long attaching a meeting waits for the sync that moves it, so the page
 * shows it there; longer syncs carry on, and the page says it's syncing.
 */
const ATTACH_WAIT_MS = 4_000;

/**
 * What a connector's state holds about matching its records: the ones
 * attached to a client by hand, and the meetings the last sync couldn't match.
 */
const matchingStateSchema = z.object({
  attached: z.record(z.string(), z.string()).catch(() => ({})),
  unattached: z.array(unattachedMeetingSchema).catch(() => []),
});
const matchingState = (state: Record<string, unknown>) =>
  matchingStateSchema.parse(state);

/** Where to send people when a tool's own address can't be worked out. */
const TOOL_HOMES: Record<Tool, string> = {
  ninjaone: 'https://www.ninjaone.com',
  hudu: 'https://www.hudu.com',
  sharepoint: 'https://www.office.com',
  fathom: 'https://fathom.video',
};

export const publicConnector = ({
  credentials: _credentials,
  state: _state,
  ...connector
}: ConnectorRecord): Connector => connector;

/**
 * Connects tools and keeps them in sync. Syncs for one workspace run one at
 * a time, so two tools never create the same client twice; each sync swaps
 * the tool's records in one transaction, and a failed sync leaves the last
 * good records in place and says what went wrong.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  /** The tail of each workspace's queue. */
  private readonly queues = new Map<string, Promise<void>>();
  /** Syncs waiting to start, so repeated requests share one run. */
  private readonly waiting = new Map<string, Promise<void>>();
  /** Told about every sync that finishes healthy. */
  private readonly synced = new Set<
    (workspaceId: string, tool: Tool) => void
  >();

  constructor(
    @Inject(DATABASE) private readonly db: DatabaseAdapter,
    @Inject(CONNECTORS)
    private readonly connectors: ReadonlyMap<Tool, ToolConnector>,
    @Inject(HTTP_OPTIONS) private readonly httpOptions: HttpOptions,
    private readonly secrets: Secrets,
  ) {}

  /** Calls `listener` after each sync that finishes healthy; returns an unsubscribe. */
  onSynced(listener: (workspaceId: string, tool: Tool) => void): () => void {
    this.synced.add(listener);
    return () => this.synced.delete(listener);
  }

  /**
   * Checks the credentials with the tool, stores them encrypted, and starts
   * the first sync. Throws 422 with the tool's problem in plain words.
   */
  async connect(
    workspaceId: string,
    credentials: ConnectorCredentials,
  ): Promise<Connector> {
    this.requireSecrets();
    await this.checkAddress(credentials);
    const connector = this.connectorFor(credentials.tool);
    const audit: AuditEntry[] = [];
    const ctx = this.context(workspaceId, credentials.tool, audit);

    let account: string;
    let stored = credentials;
    try {
      const session = await connector.open(credentials as never, ctx);
      account = session.account;
      stored = session.credentials ?? credentials;
    } catch (error) {
      throw refusal(error);
    } finally {
      await this.db.audit.append(workspaceId, audit);
    }

    const existing = await this.db.connectors.get(
      workspaceId,
      credentials.tool,
    );
    const record: ConnectorRecord = {
      id: `${workspaceId}.${credentials.tool}`,
      tool: credentials.tool,
      account,
      scope: existing?.scope ?? 'Waiting for the first sync',
      access: connector.access,
      status: 'syncing',
      lastSyncAt: existing?.lastSyncAt ?? null,
      failure: existing?.failure ?? null,
      credentials: this.secrets.encrypt(stored),
      state: existing?.state ?? {},
    };
    await this.db.connectors.save(workspaceId, record);
    void this.sync(workspaceId, credentials.tool);
    return publicConnector(record);
  }

  /**
   * Starts signing in with NinjaOne, which tickets need. The app's details
   * and a one-time state are sealed into `pending` with the credentials key,
   * for the web app to hold until NinjaOne sends the person back.
   */
  startNinjaOneSignIn(
    workspaceId: string,
    app: NinjaOneSignIn,
  ): NinjaOneSignInStart {
    this.requireSecrets();
    const state = randomBytes(24).toString('base64url');
    // An app with no secret proves it started the sign-in with PKCE instead.
    const verifier = randomBytes(32).toString('base64url');
    const pkce = app.clientSecret
      ? undefined
      : {
          verifier,
          challenge: createHash('sha256').update(verifier).digest('base64url'),
        };
    const pending: PendingSignIn = {
      kind: 'ninjaone-sign-in',
      workspaceId,
      app,
      state,
      pkce,
      expiresAt: Date.now() + SIGN_IN_MINUTES * 60_000,
    };
    return {
      authorizeUrl: this.ninjaOne().authorizeUrl(app, state, pkce),
      pending: this.secrets.encrypt(pending),
    };
  }

  /**
   * Finishes it: checks NinjaOne sent the person back to the workspace that
   * started, in time, with the same state; trades the code for a refresh
   * token; then connects as usual. 400 for a stale or foreign sign-in, 422
   * with NinjaOne's problem in plain words.
   */
  async finishNinjaOneSignIn(
    workspaceId: string,
    { pending, state, code }: NinjaOneSignInFinish,
  ): Promise<Connector> {
    this.requireSecrets();
    const sealed = this.openPending(pending);
    if (
      !sealed ||
      sealed.workspaceId !== workspaceId ||
      sealed.expiresAt < Date.now() ||
      !sameText(sealed.state, state)
    ) {
      throw new BadRequestException(
        'That NinjaOne sign-in has expired or didn’t start here. Sign in with NinjaOne again.',
      );
    }
    const audit: AuditEntry[] = [];
    const ctx = this.context(workspaceId, 'ninjaone', audit);
    let credentials: ConnectorCredentials;
    try {
      credentials = await this.ninjaOne().finishSignIn(
        sealed.app,
        code,
        ctx,
        sealed.pkce,
      );
    } catch (error) {
      throw refusal(error);
    } finally {
      await this.db.audit.append(workspaceId, audit);
    }
    return this.connect(workspaceId, credentials);
  }

  /** Marks the tool as syncing and queues a sync. Null when it isn't connected. */
  async requestSync(
    workspaceId: string,
    tool: Tool,
  ): Promise<Connector | null> {
    const updated = await this.db.connectors.update(workspaceId, tool, {
      status: 'syncing',
    });
    if (!updated) return null;
    void this.sync(workspaceId, tool);
    return publicConnector(updated);
  }

  /** Syncs one tool; resolves when it has finished, whether or not it worked. */
  sync(workspaceId: string, tool: Tool): Promise<void> {
    const key = `${workspaceId}:${tool}`;
    const waiting = this.waiting.get(key);
    if (waiting) return waiting;
    const run = this.enqueue(workspaceId, async () => {
      this.waiting.delete(key);
      await this.run(workspaceId, tool);
    });
    this.waiting.set(key, run);
    return run;
  }

  /** Meetings to attach, and the ones attached by hand; empty without Fathom. */
  async meetingAttachments(workspaceId: string): Promise<MeetingAttachments> {
    const record = await this.db.connectors.get(workspaceId, MEETINGS_TOOL);
    return matchingState(record?.state ?? {});
  }

  /**
   * Attaches a recorded meeting to a client by hand, or with null leaves it
   * to matching again, then syncs Fathom so the meeting moves. Waits a few
   * seconds for that sync. False when Fathom isn't connected.
   */
  async attachMeeting(
    workspaceId: string,
    meetingId: string,
    clientId: string | null,
  ): Promise<boolean> {
    let connected = false;
    let failure: unknown;
    // In the queue, so a sync can't write its state over this.
    await this.enqueue(workspaceId, async () => {
      try {
        const record = await this.db.connectors.get(workspaceId, MEETINGS_TOOL);
        if (!record) return;
        connected = true;
        const { attached, unattached } = matchingState(record.state);
        if (clientId) attached[meetingId] = clientId;
        else delete attached[meetingId];
        await this.db.connectors.update(workspaceId, MEETINGS_TOOL, {
          status: 'syncing',
          state: {
            ...record.state,
            attached,
            unattached: unattached.filter((m) => m.id !== meetingId),
          },
        });
      } catch (error) {
        failure = error;
      }
    });
    if (failure) throw failure;
    if (!connected) return false;

    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.sync(workspaceId, MEETINGS_TOOL),
      new Promise((resolve) => {
        timer = setTimeout(resolve, ATTACH_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return true;
  }

  /** Forgets the credentials and everything read from the tool. */
  disconnect(workspaceId: string, tool: Tool): Promise<void> {
    return this.enqueue(workspaceId, async () => {
      await this.db.connectors.remove(workspaceId, tool);
      await this.db.records.removeTool(workspaceId, tool);
    });
  }

  private enqueue(workspaceId: string, task: () => Promise<void>) {
    const previous = this.queues.get(workspaceId) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(workspaceId, next);
    void next
      .catch((error: unknown) =>
        this.logger.error(`Queued work failed: ${(error as Error).message}`),
      )
      .finally(() => {
        if (this.queues.get(workspaceId) === next) {
          this.queues.delete(workspaceId);
        }
      });
    return next.catch(() => {});
  }

  private async run(workspaceId: string, tool: Tool) {
    const record = await this.db.connectors.get(workspaceId, tool);
    if (!record) return;
    const connector = this.connectorFor(tool);
    const audit: AuditEntry[] = [];
    const ctx = this.context(workspaceId, tool, audit);
    const now = ctx.now.toISOString();
    let home = TOOL_HOMES[tool];

    await this.db.connectors.update(workspaceId, tool, { status: 'syncing' });
    try {
      const credentials = this.credentialsOf(record);
      home = connector.home(credentials as never);
      const session = await connector.open(credentials as never, ctx);
      // Keep a new refresh token now: the old one may already be spent.
      if (session.credentials) {
        await this.db.connectors.update(workspaceId, tool, {
          credentials: this.secrets.encrypt(session.credentials),
        });
      }
      const orgs = await session.organizations();

      const [clients, links] = await Promise.all([
        this.db.clients.list(workspaceId),
        this.db.clients.links(workspaceId),
      ]);
      if (
        connector.createsClients &&
        orgs.length === 0 &&
        links.some((link) => link.tool === tool)
      ) {
        throw new ToolError(
          'unexpected',
          `${TOOL_NAMES[tool]} returned no organisations at all, so Dossier kept the clients it already had.`,
        );
      }
      const directory = new ClientDirectory(workspaceId, clients, links);
      const adopted = directory.adopt(tool, orgs, connector.createsClients);
      await this.db.clients.sync(workspaceId, tool, adopted, now);

      const matching = matchingState(record.state);
      const read = await session.read(
        directory.lookup(tool, matching.attached),
      );
      await this.db.records.replace(
        workspaceId,
        tool,
        consistent(read, (id) => directory.has(id)),
      );
      await this.db.connectors.update(workspaceId, tool, {
        status: 'healthy',
        lastSyncAt: now,
        failure: null,
        scope: read.scope,
        account: session.account,
        ...(read.unattached && {
          state: { ...record.state, unattached: read.unattached },
        }),
      });

      // New clients may be what other tools' folders and meetings were waiting for.
      const added = adopted.clients.some(
        (client) => !clients.some((c) => c.id === client.id),
      );
      if (added) await this.syncAttachedTools(workspaceId, tool);
      for (const listener of this.synced) {
        try {
          listener(workspaceId, tool);
        } catch (error) {
          this.warn(error);
        }
      }
    } catch (error) {
      await this.fail(workspaceId, tool, record, error, ctx, home);
    } finally {
      await this.db.audit.append(workspaceId, audit).catch(this.warn);
      await this.db.audit
        .prune(
          workspaceId,
          new Date(ctx.now.getTime() - AUDIT_DAYS * DAY_MS).toISOString(),
        )
        .catch(this.warn);
    }
  }

  private async syncAttachedTools(workspaceId: string, from: Tool) {
    const connected = await this.db.connectors.list(workspaceId);
    for (const { tool } of connected) {
      if (tool !== from && !this.connectorFor(tool).createsClients) {
        void this.sync(workspaceId, tool);
      }
    }
  }

  /** Records the failure on the connector and as an attention item. */
  private async fail(
    workspaceId: string,
    tool: Tool,
    record: ConnectorRecord,
    error: unknown,
    ctx: SyncContext,
    home: string,
  ) {
    const name = TOOL_NAMES[tool];
    const problem =
      error instanceof ToolError
        ? error
        : new ToolError(
            'unexpected',
            `Something went wrong while syncing ${name}.`,
            (error as Error)?.message,
          );
    if (!(error instanceof ToolError)) {
      this.logger.error(
        `Syncing ${tool} for ${workspaceId} failed`,
        (error as Error)?.stack,
      );
    }
    const now = ctx.now.toISOString();
    const since = record.failure?.since ?? now;
    const needsSettings = ['credentials', 'permission', 'not-found'].includes(
      problem.kind,
    );

    await this.db.connectors
      .update(workspaceId, tool, {
        status: 'failing',
        failure: {
          since,
          summary: `${problem.message} Until ${name} syncs again, what Dossier shows from it may be out of date.`,
          fix: needsSettings ? `Update ${name} settings` : 'Try again',
        },
      })
      .catch(this.warn);

    const log: RecordSource = {
      id: ctx.id('sync-log'),
      kind: 'record',
      clientId: null,
      tool,
      recordId: 'SYNC',
      recordType: 'Sync log',
      title: oneLine(problem.message, 160),
      recordedAt: now,
      url: home,
      fields: [
        { label: 'Problem', value: problem.message },
        ...(problem.detail
          ? [{ label: 'Response', value: oneLine(problem.detail, 300) }]
          : []),
      ],
    };
    const item: AttentionItem = {
      id: ctx.id('attention-connection'),
      clientId: null,
      kind: 'connection',
      urgency: 'high',
      title: `${name} has stopped syncing`,
      raisedAt: since,
      sourceIds: [log.id],
    };
    await this.db.records
      .upsert(workspaceId, tool, { sources: [log], attention: [item] })
      .catch(this.warn);
  }

  private context(
    workspaceId: string,
    tool: Tool,
    audit: AuditEntry[],
  ): SyncContext {
    const now = new Date();
    return {
      workspaceId,
      now,
      http: new ToolHttp(TOOL_NAMES[tool], this.httpOptions),
      id: (kind, ...parts) =>
        `${tool}-${kind}-${stableHash(workspaceId, tool, kind, ...parts)}`,
      audit: (read, recordCount, clientId = null) =>
        audit.push({
          id: `aud-${randomUUID()}`,
          at: new Date().toISOString(),
          tool,
          read,
          clientId,
          recordCount,
        }),
    };
  }

  private credentialsOf(record: ConnectorRecord): ConnectorCredentials {
    try {
      return connectorCredentialsSchema.parse(
        this.secrets.decrypt(record.credentials),
      );
    } catch {
      throw new ToolError(
        'credentials',
        `Dossier can’t read the saved ${TOOL_NAMES[record.tool]} credentials. If CONNECTOR_SECRET_KEY changed, connect ${TOOL_NAMES[record.tool]} again.`,
      );
    }
  }

  private connectorFor(tool: Tool): ToolConnector {
    const connector = this.connectors.get(tool);
    if (!connector) throw new Error(`No connector for ${tool}`);
    return connector;
  }

  private ninjaOne(): NinjaOneConnector {
    return this.connectorFor('ninjaone') as NinjaOneConnector;
  }

  private requireSecrets() {
    if (!this.secrets.available) {
      throw new ServiceUnavailableException(
        'Connecting tools needs CONNECTOR_SECRET_KEY set on the API. Generate one with `openssl rand -base64 32`.',
      );
    }
  }

  /** Null when it was tampered with, sealed with another key, or isn't one. */
  private openPending(pending: string): PendingSignIn | null {
    try {
      return pendingSignInSchema.parse(this.secrets.decrypt(pending));
    } catch {
      return null;
    }
  }

  /**
   * Hudu runs at an address the customer types in. In production, only call
   * public https addresses, never something inside a private network.
   */
  private async checkAddress(credentials: ConnectorCredentials) {
    if (credentials.tool !== 'hudu' || process.env.NODE_ENV !== 'production') {
      return;
    }
    const url = new URL(credentials.url);
    if (url.protocol !== 'https:') {
      throw new BadRequestException('Use the https:// address of your Hudu.');
    }
    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true }).catch(() => []);
    if (addresses.length === 0) {
      throw new UnprocessableEntityException({
        message: `Dossier couldn’t find ${url.hostname}. Check the address.`,
        kind: 'unreachable',
      });
    }
    if (addresses.some(({ address }) => isPrivate(address))) {
      throw new BadRequestException(
        'That address is inside a private network, which Dossier won’t call.',
      );
    }
  }

  private readonly warn = (error: unknown) =>
    this.logger.warn((error as Error)?.message ?? String(error));
}

/** A tool's no, as a 422 in plain words; anything else as it was. */
function refusal(error: unknown): unknown {
  return error instanceof ToolError
    ? new UnprocessableEntityException({
        message: error.message,
        kind: error.kind,
      })
    : error;
}

const sameText = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * What a connector read, made safe to store: one record per ID, records only
 * for known clients, and citations only to sources that exist.
 */
export function consistent(
  read: ToolRecords,
  knownClient: (clientId: string) => boolean,
): ToolRecords {
  const unique = <T extends { id: string }>(items: T[]) => [
    ...new Map(items.map((item) => [item.id, item])).values(),
  ];
  const forKnown = <T extends { clientId: string | null }>(item: T) =>
    item.clientId === null || knownClient(item.clientId);

  const sources = unique(read.sources).filter(forKnown);
  const ids = new Set(sources.map((s) => s.id));
  const cited = <T extends { sourceIds: string[] }>(item: T): T | [] => {
    const sourceIds = item.sourceIds.filter((id) => ids.has(id));
    return sourceIds.length > 0 ? { ...item, sourceIds } : [];
  };

  return {
    sources,
    devices: unique(read.devices)
      .filter(forKnown)
      .filter((d) => ids.has(d.sourceId)),
    tickets: unique(read.tickets)
      .filter(forKnown)
      .filter((t) => ids.has(t.sourceId)),
    meetings: unique(read.meetings)
      .filter(forKnown)
      .filter((m) => ids.has(m.recordingSourceId)),
    commitments: unique(read.commitments).filter(forKnown).flatMap(cited),
    attention: unique(read.attention).filter(forKnown).flatMap(cited),
  };
}

/** Loopback, private, link-local and similar ranges. */
function isPrivate(address: string): boolean {
  const v4 = address.replace(/^::ffff:/i, '');
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = address.toLowerCase();
  return (
    v6 === '::1' ||
    v6 === '::' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe80')
  );
}
