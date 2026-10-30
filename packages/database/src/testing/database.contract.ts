import {
  AUDIT_COUNT_GROUPS,
  attentionItemSchema,
  auditEntrySchema,
  clientSchema,
  commitmentSchema,
  connectorSchema,
  deviceSchema,
  meetingSchema,
  recommendationSchema,
  reportSchema,
  sourceSchema,
  ticketSchema,
  userSchema,
  workspaceSchema,
  type AskAnswer,
  type AttentionItem,
  type AuditEntry,
  type Client,
  type ClientListItem,
  type Commitment,
  type ContractDocument,
  type Device,
  type Meeting,
  type MeetingNote,
  type NoteSource,
  type Pattern,
  type Recipient,
  type Recommendation,
  type Report,
  type Source,
  type Ticket,
  type Tool,
} from '@dossierhq/contracts';
import { demo } from '@dossierhq/fixtures';
import { z } from 'zod';
import {
  byAttention,
  byAuditRecency,
  byCommitment,
  byDevice,
  byMeeting,
  byMember,
  byName,
  byNotification,
  byOverview,
  byRecommendation,
  byReportWeek,
  bySourceRecency,
  byTicket,
  byTool,
  compareText,
  inAuditGroup,
  toSummary,
} from '../ordering.js';
import {
  AUDIT_PAGE_SIZE,
  type AskChanges,
  type ClientLink,
  type ConnectorRecord,
  type MeetingPointsRecord,
  type DatabaseAdapter,
  type DeliveryRecord,
  type IntelligenceRun,
  type InviteRecord,
  type NotificationRecord,
  type StoredReportSettings,
} from '../types.js';
import { SCRATCH_PREFIX } from './load-demo.js';

const ws = demo.workspace.id;
const clientName = (id: string) =>
  demo.clients.find((c) => c.id === id)?.name ?? id;
const forClient = (clientId: string) => (item: { clientId: string | null }) =>
  item.clientId === clientId;

/** What every adapter must return for the demo workspace. */
const expected = {
  clients: [...demo.clients].sort(byName),
  overview: demo.clients
    .map((client): ClientListItem => {
      const items = demo.attentionItems.filter(forClient(client.id));
      const latest = demo.reports
        .filter(forClient(client.id))
        .sort((a, b) => compareText(b.weekStart, a.weekStart))[0];
      const meetings = demo.meetings.filter(forClient(client.id));
      return {
        client,
        attention: {
          total: items.length,
          critical: items.filter((i) => i.urgency === 'critical').length,
          high: items.filter((i) => i.urgency === 'high').length,
        },
        lastMeetingAt:
          meetings
            .map((m) => m.occurredAt)
            .sort(compareText)
            .at(-1) ?? null,
        latestReport: latest ? toSummary(latest) : null,
      };
    })
    .sort(byOverview),
  recent: [...demo.clientViews]
    .sort((a, b) => compareText(b.viewedAt, a.viewedAt))
    .map((view) => demo.clients.find((c) => c.id === view.clientId)!),
};

/**
 * The behaviour every adapter must share, checked against the demo workspace.
 * Each adapter's test file runs this; a new adapter is ready once it passes.
 *
 * SQL adapters load the demo workspace through `prepare` (see load-demo.ts),
 * which returns the clean-up. Tests that change demo data put it back; tests
 * of sync writes use a scratch workspace of their own.
 */
export function describeDatabaseContract(
  name: string,
  setup: () => Promise<DatabaseAdapter>,
  {
    skip = false,
    prepare,
  }: { skip?: boolean; prepare?: () => Promise<() => Promise<void>> } = {},
) {
  describe.skipIf(skip)(`${name} adapter: database contract`, () => {
    let db: DatabaseAdapter;
    let cleanUp: (() => Promise<void>) | undefined;

    beforeAll(async () => {
      cleanUp = await prepare?.();
      db = await setup();
      await db.ping();
    });

    afterAll(async () => {
      await db?.close();
      await cleanUp?.();
    });

    describe('sign-up', () => {
      const workspace = {
        id: `${SCRATCH_PREFIX}sign-up`,
        name: 'Sign-up',
        timeZone: 'UTC',
      };
      const owner = {
        id: `${SCRATCH_PREFIX}usr-sign-up`,
        email: 'sign-up@example.com',
        name: 'Sign Up',
        title: '',
        passwordHash: 'not-a-real-hash',
      };

      it('creates a workspace with its owner', async () => {
        await expect(db.users.createOwner(workspace, owner)).resolves.toBe(
          true,
        );
        await expect(db.workspaces.get(workspace.id)).resolves.toEqual(
          workspace,
        );
        await expect(db.users.findByEmail(owner.email)).resolves.toEqual(owner);
        await expect(db.users.memberships(owner.id)).resolves.toEqual([
          { workspaceId: workspace.id, userId: owner.id, role: 'owner' },
        ]);
        await expect(db.clients.list(workspace.id)).resolves.toEqual([]);
      });

      it('changes nothing when the email already has an account', async () => {
        const taken = { ...workspace, id: `${SCRATCH_PREFIX}sign-up-taken` };
        await expect(
          db.users.createOwner(taken, {
            ...owner,
            id: `${SCRATCH_PREFIX}usr-sign-up-taken`,
            email: demo.users[0]!.email,
          }),
        ).resolves.toBe(false);
        await expect(db.workspaces.get(taken.id)).resolves.toBeNull();
        await expect(
          db.users.get(`${SCRATCH_PREFIX}usr-sign-up-taken`),
        ).resolves.toBeNull();
      });
    });

    describeSyncWrites(() => db);
    describeEventsAndNotifications(() => db);

    describe('users and sessions', () => {
      const sam = demo.users[0]!;

      it('finds a user by email, ignoring case', async () => {
        await expect(
          db.users.findByEmail(sam.email.toUpperCase()),
        ).resolves.toEqual(sam);
        await expect(
          db.users.findByEmail('nobody@example.com'),
        ).resolves.toBeNull();
      });

      it('reads a user without their password hash', async () => {
        const user = await db.users.get(sam.id);
        expect(userSchema.strict().parse(user)).toEqual({
          id: sam.id,
          email: sam.email,
          name: sam.name,
          title: sam.title,
        });
        await expect(db.users.get('no-such-user')).resolves.toBeNull();
      });

      it('lists memberships', async () => {
        await expect(db.users.memberships(sam.id)).resolves.toEqual(
          demo.memberships.filter((m) => m.userId === sam.id),
        );
      });

      it('creates, finds and deletes a session', async () => {
        const session = {
          tokenHash: `contract-test-${Math.random().toString(36).slice(2)}`,
          userId: sam.id,
          workspaceId: ws,
          createdAt: '2030-01-01T00:00:00.000Z',
          expiresAt: '2030-01-31T00:00:00.000Z',
          lastSeenAt: '2030-01-01T00:00:00.000Z',
        };
        try {
          await db.sessions.create(session);
          await expect(db.sessions.find(session.tokenHash)).resolves.toEqual(
            session,
          );
        } finally {
          await db.sessions.delete(session.tokenHash);
        }
        await expect(db.sessions.find(session.tokenHash)).resolves.toBeNull();
      });

      it('notes use, lists a user’s sessions, and signs out the others', async () => {
        const user = demo.users[1]!;
        const session = (key: string, createdAt: string) => ({
          tokenHash: `contract-test-${key}-${Math.random().toString(36).slice(2)}`,
          userId: user.id,
          workspaceId: ws,
          createdAt,
          expiresAt: '2030-01-31T00:00:00.000Z',
          lastSeenAt: createdAt,
        });
        const older = session('older', '2030-01-01T00:00:00.000Z');
        const newer = session('newer', '2030-01-02T00:00:00.000Z');
        try {
          await db.sessions.create(older);
          await db.sessions.create(newer);
          await db.sessions.touch(older.tokenHash, '2030-01-03T00:00:00.000Z');
          await expect(db.sessions.listForUser(user.id)).resolves.toEqual([
            newer,
            { ...older, lastSeenAt: '2030-01-03T00:00:00.000Z' },
          ]);
          await db.sessions.deleteForUser(user.id, newer.tokenHash);
          await expect(db.sessions.listForUser(user.id)).resolves.toEqual([
            newer,
          ]);
        } finally {
          await db.sessions.deleteForUser(user.id);
        }
        await expect(db.sessions.listForUser(user.id)).resolves.toEqual([]);
      });

      it('deletes sessions that expired or went unused', async () => {
        // Long ago, so a developer's own sessions are never in range.
        const session = (
          key: string,
          expiresAt: string,
          lastSeenAt: string,
        ) => ({
          tokenHash: `contract-test-${key}-${Math.random().toString(36).slice(2)}`,
          userId: sam.id,
          workspaceId: ws,
          createdAt: '1999-01-01T00:00:00.000Z',
          expiresAt,
          lastSeenAt,
        });
        const expired = session(
          'expired',
          '1999-12-31T00:00:00.000Z',
          '1999-12-30T00:00:00.000Z',
        );
        const unused = session(
          'unused',
          '2030-01-31T00:00:00.000Z',
          '1999-12-15T00:00:00.000Z',
        );
        const live = session(
          'live',
          '2030-01-31T00:00:00.000Z',
          '2000-06-01T00:00:00.000Z',
        );
        try {
          for (const s of [expired, unused, live]) await db.sessions.create(s);
          await expect(
            db.sessions.deleteEnded(
              '2000-01-01T00:00:00.000Z',
              '2000-01-01T00:00:00.000Z',
            ),
          ).resolves.toBe(2);
          await expect(db.sessions.find(expired.tokenHash)).resolves.toBeNull();
          await expect(db.sessions.find(unused.tokenHash)).resolves.toBeNull();
          await expect(db.sessions.find(live.tokenHash)).resolves.toEqual(live);
        } finally {
          await db.sessions.delete(live.tokenHash);
        }
      });
    });

    describe('people and invites', () => {
      const workspace = {
        id: `${SCRATCH_PREFIX}people`,
        name: 'People',
        timeZone: 'UTC',
      };
      const owner = {
        id: `${SCRATCH_PREFIX}usr-people-owner`,
        email: 'people-owner@example.com',
        name: 'Ola Owner',
        title: '',
        passwordHash: 'owner-hash',
      };
      const newcomer = (key: string) => ({
        id: `${SCRATCH_PREFIX}usr-${key}`,
        // The invite's email wins; this one is ignored.
        email: 'ignored@example.com',
        name: `Nia ${key}`,
        title: 'Technician',
        passwordHash: 'new-hash',
      });
      const invite = (
        key: string,
        email: string,
        expiresAt = '2030-01-08T00:00:00.000Z',
      ): InviteRecord => ({
        id: `${SCRATCH_PREFIX}inv-${key}`,
        email,
        role: 'admin',
        invitedBy: owner.name,
        invitedByUserId: owner.id,
        createdAt: '2030-01-01T00:00:00.000Z',
        expiresAt,
        tokenHash: `contract-test-${key}-${Math.random().toString(36).slice(2)}`,
      });
      const publicOf = ({
        tokenHash: _hash,
        invitedByUserId: _by,
        ...rest
      }: InviteRecord) => rest;
      const now = '2030-01-02T00:00:00.000Z';
      const ownerMember = {
        id: owner.id,
        email: owner.email,
        name: owner.name,
        title: owner.title,
        role: 'owner',
      };

      beforeAll(async () => {
        await db.users.createOwner(workspace, owner);
      });

      it('lists the members of a workspace', async () => {
        await expect(db.users.members(workspace.id)).resolves.toEqual([
          ownerMember,
        ]);
        await expect(db.users.members('elsewhere')).resolves.toEqual([]);
      });

      it('saves, replaces and withdraws invites', async () => {
        const first = invite('first', 'pat@example.com');
        const again = {
          ...invite('again', 'pat@example.com'),
          role: 'technician' as const,
        };
        await db.invites.save(workspace.id, first);
        await db.invites.save(workspace.id, again);
        await expect(db.invites.list(workspace.id)).resolves.toEqual([
          publicOf(again),
        ]);
        await expect(
          db.invites.findByToken(first.tokenHash),
        ).resolves.toBeNull();
        await expect(db.invites.findByToken(again.tokenHash)).resolves.toEqual({
          ...publicOf(again),
          workspaceId: workspace.id,
        });
        await expect(db.invites.list('elsewhere')).resolves.toEqual([]);
        await expect(db.invites.remove('elsewhere', again.id)).resolves.toBe(
          false,
        );
        await expect(db.invites.remove(workspace.id, again.id)).resolves.toBe(
          true,
        );
        await expect(db.invites.remove(workspace.id, again.id)).resolves.toBe(
          false,
        );
        await expect(db.invites.list(workspace.id)).resolves.toEqual([]);
      });

      it('accepts an invite once, with its email and role', async () => {
        const sent = invite('accept', 'nia@example.com');
        await db.invites.save(workspace.id, sent);
        const nia = newcomer('accept');
        const outcomes = await Promise.all([
          db.invites.accept(sent.tokenHash, nia, now),
          db.invites.accept(sent.tokenHash, newcomer('racer'), now),
        ]);
        expect(outcomes.toSorted()).toEqual(['accepted', 'invalid']);

        const accepted = outcomes[0] === 'accepted' ? nia : newcomer('racer');
        await expect(db.users.findByEmail('nia@example.com')).resolves.toEqual({
          ...accepted,
          email: 'nia@example.com',
        });
        await expect(db.users.members(workspace.id)).resolves.toEqual(
          [
            ownerMember,
            {
              id: accepted.id,
              email: 'nia@example.com',
              name: accepted.name,
              title: accepted.title,
              role: 'admin',
            },
          ].sort(byMember),
        );
        await expect(db.invites.list(workspace.id)).resolves.toEqual([]);
      });

      it('refuses expired invites and emails that have an account', async () => {
        const late = invite('late', 'late@example.com', now);
        await db.invites.save(workspace.id, late);
        await expect(
          db.invites.accept(late.tokenHash, newcomer('late'), now),
        ).resolves.toBe('invalid');

        const taken = invite('taken', owner.email);
        await db.invites.save(workspace.id, taken);
        await expect(
          db.invites.accept(taken.tokenHash, newcomer('taken'), now),
        ).resolves.toBe('taken');
        await expect(db.users.get(newcomer('taken').id)).resolves.toBeNull();
        // Kept, so an admin can see it and withdraw it.
        await expect(
          db.invites.findByToken(taken.tokenHash),
        ).resolves.not.toBeNull();
        await db.invites.remove(workspace.id, late.id);
        await db.invites.remove(workspace.id, taken.id);
      });

      it('changes roles, and removes members with their account', async () => {
        const sent = invite('remove', 'leaving@example.com');
        await db.invites.save(workspace.id, sent);
        const leaving = newcomer('remove');
        await db.invites.accept(sent.tokenHash, leaving, now);

        await expect(
          db.users.setRole(workspace.id, leaving.id, 'technician'),
        ).resolves.toBe(true);
        await expect(
          db.users.setRole(workspace.id, 'nobody', 'technician'),
        ).resolves.toBe(false);
        await expect(db.users.memberships(leaving.id)).resolves.toEqual([
          { workspaceId: workspace.id, userId: leaving.id, role: 'technician' },
        ]);

        const tokenHash = `contract-test-${Math.random().toString(36).slice(2)}`;
        await db.sessions.create({
          tokenHash,
          userId: leaving.id,
          workspaceId: workspace.id,
          createdAt: now,
          expiresAt: '2030-01-31T00:00:00.000Z',
          lastSeenAt: '2030-01-01T00:00:00.000Z',
        });
        await expect(
          db.users.removeMember(workspace.id, leaving.id),
        ).resolves.toBe(true);
        await expect(db.sessions.find(tokenHash)).resolves.toBeNull();
        await expect(db.users.get(leaving.id)).resolves.toBeNull();
        await expect(
          db.users.findByEmail('leaving@example.com'),
        ).resolves.toBeNull();
        await expect(
          db.users.removeMember(workspace.id, leaving.id),
        ).resolves.toBe(false);
      });
    });

    describe('two-factor sign-in', () => {
      const user = {
        id: `${SCRATCH_PREFIX}usr-mfa`,
        email: 'mfa@example.com',
        name: 'Mo Factor',
        title: '',
        passwordHash: 'mfa-hash',
      };
      const at = '2030-01-01T00:00:00.000Z';

      beforeAll(async () => {
        await db.users.createOwner(
          { id: `${SCRATCH_PREFIX}mfa`, name: 'MFA', timeZone: 'UTC' },
          user,
        );
      });

      it('sets up, turns on, and refuses a new setup while on', async () => {
        await expect(db.mfa.get(user.id)).resolves.toBeNull();
        await expect(db.mfa.begin(user.id, 'sealed-1', at)).resolves.toBe(true);
        // Starting again before it's on replaces the secret.
        await expect(db.mfa.begin(user.id, 'sealed-2', at)).resolves.toBe(true);
        await expect(db.mfa.useStep(user.id, 1)).resolves.toBe(false);
        await expect(db.mfa.enable(user.id, ['h1', 'h2'], at)).resolves.toBe(
          true,
        );
        await expect(db.mfa.enable(user.id, ['h3'], at)).resolves.toBe(false);
        await expect(db.mfa.begin(user.id, 'sealed-3', at)).resolves.toBe(
          false,
        );
        await expect(db.mfa.get(user.id)).resolves.toEqual({
          userId: user.id,
          secret: 'sealed-2',
          enabledAt: at,
          lastStep: null,
          recoveryHashes: ['h1', 'h2'],
          createdAt: at,
        });
      });

      it('uses each step once, and never an earlier one', async () => {
        await expect(db.mfa.useStep(user.id, 100)).resolves.toBe(true);
        await expect(db.mfa.useStep(user.id, 100)).resolves.toBe(false);
        await expect(db.mfa.useStep(user.id, 99)).resolves.toBe(false);
        const raced = await Promise.all([
          db.mfa.useStep(user.id, 101),
          db.mfa.useStep(user.id, 101),
        ]);
        expect(raced.filter(Boolean)).toEqual([true]);
      });

      it('uses each recovery code once', async () => {
        await expect(db.mfa.useRecoveryCode(user.id, 'h1')).resolves.toBe(true);
        await expect(db.mfa.useRecoveryCode(user.id, 'h1')).resolves.toBe(
          false,
        );
        await expect(db.mfa.useRecoveryCode(user.id, 'nope')).resolves.toBe(
          false,
        );
        await expect(db.mfa.get(user.id)).resolves.toMatchObject({
          recoveryHashes: ['h2'],
        });
        await db.mfa.remove(user.id);
        await expect(db.mfa.get(user.id)).resolves.toBeNull();
        await expect(db.mfa.useRecoveryCode(user.id, 'h2')).resolves.toBe(
          false,
        );
      });
    });

    describe('rate limits', () => {
      const bucket = () =>
        `contract-test-${Math.random().toString(36).slice(2)}`;

      it('counts hits on a bucket since a moment, and clears it', async () => {
        const [mine, other] = [bucket(), bucket()];
        await db.rateLimits.hit(mine, '2030-01-01T00:00:00.000Z');
        await db.rateLimits.hit(mine, '2030-01-01T00:10:00.000Z');
        await db.rateLimits.hit(other, '2030-01-01T00:10:00.000Z');
        await expect(
          db.rateLimits.count(mine, '2030-01-01T00:00:00.000Z'),
        ).resolves.toBe(2);
        await expect(
          db.rateLimits.count(mine, '2030-01-01T00:05:00.000Z'),
        ).resolves.toBe(1);
        await db.rateLimits.clear(mine);
        await expect(
          db.rateLimits.count(mine, '2000-01-01T00:00:00.000Z'),
        ).resolves.toBe(0);
        await expect(
          db.rateLimits.count(other, '2000-01-01T00:00:00.000Z'),
        ).resolves.toBe(1);
        await db.rateLimits.clear(other);
      });

      it('prunes old hits from every bucket', async () => {
        const [a, b] = [bucket(), bucket()];
        await db.rateLimits.hit(a, '2030-01-01T00:00:00.000Z');
        await db.rateLimits.hit(b, '2030-01-01T00:00:00.000Z');
        await db.rateLimits.hit(b, '2030-01-03T00:00:00.000Z');
        await db.rateLimits.prune('2030-01-02T00:00:00.000Z');
        const since = '2000-01-01T00:00:00.000Z';
        await expect(db.rateLimits.count(a, since)).resolves.toBe(0);
        await expect(db.rateLimits.count(b, since)).resolves.toBe(1);
        await db.rateLimits.clear(b);
      });
    });

    describe('password resets', () => {
      const user = {
        id: `${SCRATCH_PREFIX}usr-reset`,
        email: 'reset@example.com',
        name: 'Reset',
        title: '',
        passwordHash: 'old-hash',
      };
      const unique = () =>
        `contract-test-${Math.random().toString(36).slice(2)}`;
      const reset = (tokenHash: string) => ({
        tokenHash,
        userId: user.id,
        createdAt: '2030-01-01T00:00:00.000Z',
        expiresAt: '2030-01-01T01:00:00.000Z',
      });
      const before = '2030-01-01T00:30:00.000Z';

      beforeAll(async () => {
        await db.users.createOwner(
          { id: `${SCRATCH_PREFIX}reset`, name: 'Reset', timeZone: 'UTC' },
          user,
        );
      });

      it('changes a password and signs the user out everywhere', async () => {
        const session = (tokenHash: string) => ({
          tokenHash,
          userId: user.id,
          workspaceId: `${SCRATCH_PREFIX}reset`,
          createdAt: '2030-01-01T00:00:00.000Z',
          expiresAt: '2030-01-31T00:00:00.000Z',
          lastSeenAt: '2030-01-01T00:00:00.000Z',
        });
        const [a, b] = [unique(), unique()];
        await db.sessions.create(session(a));
        await db.sessions.create(session(b));
        await db.users.setPassword(user.id, 'new-hash');
        await db.sessions.deleteForUser(user.id);

        await expect(db.users.findByEmail(user.email)).resolves.toMatchObject({
          passwordHash: 'new-hash',
        });
        await expect(db.sessions.find(a)).resolves.toBeNull();
        await expect(db.sessions.find(b)).resolves.toBeNull();
      });

      it('uses a reset once, and only before it expires', async () => {
        const once = unique();
        await db.passwordResets.create(reset(once));
        await expect(db.passwordResets.consume(once, before)).resolves.toBe(
          user.id,
        );
        await expect(
          db.passwordResets.consume(once, before),
        ).resolves.toBeNull();

        const late = unique();
        await db.passwordResets.create(reset(late));
        await expect(
          db.passwordResets.consume(late, '2030-01-01T01:00:00.000Z'),
        ).resolves.toBeNull();
        await expect(
          db.passwordResets.consume('no-such-reset', before),
        ).resolves.toBeNull();
      });

      it('keeps only the newest unused reset', async () => {
        const [older, newer] = [unique(), unique()];
        await db.passwordResets.create(reset(older));
        await db.passwordResets.create(reset(newer));
        await expect(
          db.passwordResets.consume(older, before),
        ).resolves.toBeNull();
        await expect(db.passwordResets.consume(newer, before)).resolves.toBe(
          user.id,
        );
      });

      it('gives a reset to only one of two racing requests', async () => {
        const raced = unique();
        await db.passwordResets.create(reset(raced));
        const winners = await Promise.all([
          db.passwordResets.consume(raced, before),
          db.passwordResets.consume(raced, before),
        ]);
        expect(winners.filter(Boolean)).toEqual([user.id]);
      });
    });

    describe('workspaces', () => {
      it('reads the workspace', async () => {
        const workspace = await db.workspaces.get(ws);
        expect(workspaceSchema.parse(workspace)).toEqual(demo.workspace);
      });

      it('returns null and empty lists for another workspace', async () => {
        await expect(db.workspaces.get('elsewhere')).resolves.toBeNull();
        await expect(db.clients.list('elsewhere')).resolves.toEqual([]);
        await expect(db.attention.list('elsewhere')).resolves.toEqual([]);
        await expect(db.reports.listSummaries('elsewhere')).resolves.toEqual(
          [],
        );
        await expect(
          db.clients.get('elsewhere', 'harbour-dental'),
        ).resolves.toBeNull();
      });
    });

    describe('clients', () => {
      it('lists clients by name', async () => {
        const clients = await db.clients.list(ws);
        expect(z.array(clientSchema).parse(clients)).toEqual(expected.clients);
      });

      it('reads one client, or null', async () => {
        await expect(db.clients.get(ws, 'harbour-dental')).resolves.toEqual(
          demo.clients.find((c) => c.id === 'harbour-dental'),
        );
        await expect(db.clients.get(ws, 'no-such-client')).resolves.toBeNull();
      });

      it('builds the overview, most urgent first', async () => {
        await expect(db.clients.overview(ws)).resolves.toEqual(
          expected.overview,
        );
      });

      it('lists recently opened clients and records views', async () => {
        await expect(db.clients.recent(ws, 3)).resolves.toEqual(
          expected.recent.slice(0, 3),
        );

        const third = demo.clientViews.toSorted((a, b) =>
          compareText(b.viewedAt, a.viewedAt),
        )[2]!;
        try {
          await expect(
            db.clients.recordView(
              ws,
              third.clientId,
              '2030-01-01T00:00:00.000Z',
            ),
          ).resolves.toBe(true);
          const [first] = await db.clients.recent(ws, 1);
          expect(first?.id).toBe(third.clientId);
        } finally {
          await db.clients.recordView(ws, third.clientId, third.viewedAt);
        }
        await expect(db.clients.recent(ws, 20)).resolves.toEqual(
          expected.recent,
        );
        await expect(
          db.clients.recordView(
            ws,
            'no-such-client',
            '2030-01-01T00:00:00.000Z',
          ),
        ).resolves.toBe(false);
      });
    });

    describe('attention, recommendations, commitments', () => {
      it('lists attention items most urgent first, optionally for one client', async () => {
        const all = await db.attention.list(ws);
        expect(z.array(attentionItemSchema).parse(all)).toEqual(
          [...demo.attentionItems].sort(byAttention),
        );
        await expect(
          db.attention.list(ws, { clientId: 'harbour-dental' }),
        ).resolves.toEqual(
          demo.attentionItems
            .filter(forClient('harbour-dental'))
            .sort(byAttention),
        );
      });

      it('lists recommendations newest first, with filters', async () => {
        const all = await db.recommendations.list(ws);
        expect(z.array(recommendationSchema).parse(all)).toEqual(
          [...demo.recommendations].sort(byRecommendation),
        );
        await expect(
          db.recommendations.list(ws, {
            clientId: 'harbour-dental',
            status: 'draft',
          }),
        ).resolves.toEqual(
          demo.recommendations
            .filter(
              (r) => r.clientId === 'harbour-dental' && r.status === 'draft',
            )
            .sort(byRecommendation),
        );
      });

      it('updates a recommendation and reads it back', async () => {
        const original = demo.recommendations[0]!;
        try {
          const updated = await db.recommendations.update(ws, original.id, {
            status: 'accepted',
            title: 'Edited title',
            decidedAt: '2030-01-01T00:00:00.000Z',
          });
          expect(updated).toEqual({
            ...original,
            status: 'accepted',
            title: 'Edited title',
            decidedAt: '2030-01-01T00:00:00.000Z',
          });
          await expect(
            db.recommendations.get(ws, original.id),
          ).resolves.toEqual(updated);
        } finally {
          await db.recommendations.update(ws, original.id, {
            status: original.status,
            title: original.title,
            reason: original.reason,
            decidedAt: original.decidedAt,
          });
        }
        await expect(db.recommendations.get(ws, original.id)).resolves.toEqual(
          original,
        );
        await expect(
          db.recommendations.update(ws, 'no-such-rec', { title: 'x' }),
        ).resolves.toBeNull();
      });

      it('lists commitments, open first', async () => {
        const all = await db.commitments.list(ws);
        expect(z.array(commitmentSchema).parse(all)).toEqual(
          [...demo.commitments].sort(byCommitment),
        );
      });
    });

    describe('meetings, devices and tickets', () => {
      it('lists meetings newest first', async () => {
        const all = await db.meetings.list(ws, { clientId: 'harbour-dental' });
        expect(z.array(meetingSchema).parse(all)).toEqual(
          demo.meetings.filter(forClient('harbour-dental')).sort(byMeeting),
        );
        await expect(db.meetings.list(ws)).resolves.toHaveLength(
          demo.meetings.length,
        );
      });

      it('lists devices needing work first', async () => {
        const all = await db.devices.list(ws, { clientId: 'harbour-dental' });
        expect(z.array(deviceSchema).parse(all)).toEqual(
          demo.devices.filter(forClient('harbour-dental')).sort(byDevice),
        );
        await expect(db.devices.list(ws)).resolves.toHaveLength(
          demo.devices.length,
        );
      });

      it('lists open tickets first, the most urgent first', async () => {
        const all = await db.tickets.list(ws, { clientId: 'harbour-dental' });
        expect(z.array(ticketSchema).parse(all)).toEqual(
          demo.tickets.filter(forClient('harbour-dental')).sort(byTicket),
        );
        await expect(db.tickets.list(ws)).resolves.toEqual(
          [...demo.tickets].sort(byTicket),
        );
      });
    });

    describe('reports', () => {
      const drafts = demo.reports.filter((r) => r.status === 'draft');

      it('lists summaries newest week first, with filters', async () => {
        await expect(db.reports.listSummaries(ws)).resolves.toEqual(
          demo.reports.map(toSummary).sort(byReportWeek(clientName)),
        );
        await expect(
          db.reports.listSummaries(ws, { status: 'draft' }),
        ).resolves.toEqual(
          drafts.map(toSummary).sort(byReportWeek(clientName)),
        );
        await expect(
          db.reports.listSummaries(ws, { clientId: 'harbour-dental' }),
        ).resolves.toEqual(
          demo.reports
            .filter(forClient('harbour-dental'))
            .map(toSummary)
            .sort(byReportWeek(clientName)),
        );
      });

      it('reads a whole report', async () => {
        const report = await db.reports.get(ws, 'harbour-dental-2026-w41');
        expect(reportSchema.parse(report)).toEqual(
          demo.reports.find((r) => r.id === 'harbour-dental-2026-w41'),
        );
        await expect(db.reports.get(ws, 'no-such-report')).resolves.toBeNull();
      });

      it('sets status in bulk and puts it back', async () => {
        const ids = [drafts[1]!.id, drafts[0]!.id, 'no-such-report'];
        const at = '2030-01-01T00:00:00.000Z';
        try {
          const approved = await db.reports.setStatus(ws, ids, 'approved', at);
          expect(approved.map((r) => [r.id, r.status, r.approvedAt])).toEqual([
            [drafts[1]!.id, 'approved', at],
            [drafts[0]!.id, 'approved', at],
          ]);
          await expect(
            db.reports.get(ws, drafts[0]!.id),
          ).resolves.toMatchObject({
            status: 'approved',
            approvedAt: at,
          });
        } finally {
          await db.reports.setStatus(ws, ids, 'draft', at);
        }
        await expect(db.reports.get(ws, drafts[0]!.id)).resolves.toEqual(
          drafts[0],
        );
      });
    });

    describe('sources, connectors, audit', () => {
      it('reads sources in the order asked, skipping unknown IDs', async () => {
        const ids = [
          'src-hd-call-restore-ask',
          'no-such-source',
          'src-hd-alert-48213',
        ];
        const sources = await db.sources.getMany(ws, ids);
        expect(
          z
            .array(sourceSchema)
            .parse(sources)
            .map((s) => s.id),
        ).toEqual(['src-hd-call-restore-ask', 'src-hd-alert-48213']);
        expect(sources).toEqual(
          ['src-hd-call-restore-ask', 'src-hd-alert-48213'].map((id) =>
            demo.sources.find((s) => s.id === id),
          ),
        );
        await expect(db.sources.getMany(ws, [])).resolves.toEqual([]);
      });

      it("lists a client's sources newest first", async () => {
        await expect(
          db.sources.listForClient(ws, 'harbour-dental'),
        ).resolves.toEqual(
          demo.sources
            .filter(forClient('harbour-dental'))
            .sort(bySourceRecency),
        );
      });

      it('lists connectors in tool order', async () => {
        const connectors = await db.connectors.list(ws);
        expect(z.array(connectorSchema).parse(connectors)).toEqual(
          [...demo.connectors].sort(byTool),
        );
      });

      it('reads the audit log newest first, with filters', async () => {
        const all = await db.audit.list(ws);
        expect(z.array(auditEntrySchema).parse(all)).toEqual(
          [...demo.auditLog].sort(byAuditRecency).slice(0, AUDIT_PAGE_SIZE),
        );
        await expect(db.audit.list(ws, { tool: 'hudu' })).resolves.toEqual(
          demo.auditLog.filter((e) => e.tool === 'hudu').sort(byAuditRecency),
        );
        const signIns = demo.auditLog.filter((e) => e.kind === 'sign-in');
        expect(signIns.length).toBeGreaterThan(0);
        await expect(db.audit.list(ws, { kind: 'sign-in' })).resolves.toEqual(
          signIns.sort(byAuditRecency),
        );
        await expect(
          db.audit.list(ws, { kind: 'change', tool: 'hudu' }),
        ).resolves.toEqual(
          demo.auditLog
            .filter((e) => e.kind === 'change' && e.tool === 'hudu')
            .sort(byAuditRecency),
        );
        await expect(
          db.audit.list(ws, { clientId: 'marlow-freight' }),
        ).resolves.toEqual(
          demo.auditLog
            .filter(
              (e) => e.clientId === 'marlow-freight' || e.clientId === null,
            )
            .sort(byAuditRecency),
        );
      });

      it('pages through the audit log both ways, across equal times', async () => {
        const newestFirst = [...demo.auditLog].sort(byAuditRecency);
        // One entry a page crosses every boundary, including the ties.
        const older: AuditEntry[] = await db.audit.list(ws, { limit: 1 });
        for (;;) {
          const page = await db.audit.list(ws, {
            before: older.at(-1)!,
            limit: 1,
          });
          if (page.length === 0) break;
          older.push(...page);
        }
        expect(older).toEqual(newestFirst);

        const newer: AuditEntry[] = [newestFirst.at(-1)!];
        for (;;) {
          const page = await db.audit.list(ws, { after: newer[0]!, limit: 1 });
          if (page.length === 0) break;
          newer.unshift(...page);
        }
        expect(newer).toEqual(newestFirst);

        // A page holds the entries next to the position, filters still apply.
        const hudu = newestFirst.filter((e) => e.tool === 'hudu');
        await expect(
          db.audit.list(ws, { tool: 'hudu', before: hudu[2]!, limit: 3 }),
        ).resolves.toEqual(hudu.slice(3, 6));
        await expect(
          db.audit.list(ws, { tool: 'hudu', after: hudu[5]!, limit: 3 }),
        ).resolves.toEqual(hudu.slice(2, 5));
        const marlow = newestFirst.filter(
          (e) => e.clientId === 'marlow-freight' || e.clientId === null,
        );
        await expect(
          db.audit.list(ws, {
            clientId: 'marlow-freight',
            before: marlow[1]!,
            limit: 2,
          }),
        ).resolves.toEqual(marlow.slice(2, 4));
        await expect(
          db.audit.list(ws, { after: newestFirst[0]! }),
        ).resolves.toEqual([]);
      });

      it('counts reads by tool, then sign-ins and changes', async () => {
        const counts = (keep: (e: AuditEntry) => boolean) =>
          AUDIT_COUNT_GROUPS.map((group) => ({
            ...group,
            count: demo.auditLog.filter(
              (e) => inAuditGroup(group)(e) && keep(e),
            ).length,
          }));
        await expect(db.audit.counts(ws)).resolves.toEqual(counts(() => true));
        await expect(
          db.audit.counts(ws, { clientId: 'marlow-freight' }),
        ).resolves.toEqual(
          counts((e) => e.clientId === 'marlow-freight' || e.clientId === null),
        );
      });
    });
  });
}

/**
 * Writes a sync makes, in a scratch workspace so the demo stays as it is. IDs
 * are prefixed with the workspace ID because SQL primary keys are global.
 */
function describeSyncWrites(getDb: () => DatabaseAdapter) {
  describe('sync writes (scratch workspace)', () => {
    const scratch = {
      id: `${SCRATCH_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
      name: 'Scratch',
      timeZone: 'Europe/London',
    };
    const ws = scratch.id;
    const at = '2030-01-01T00:00:00.000Z';
    const later = '2030-01-02T00:00:00.000Z';
    const id = (suffix: string) => `${ws}-${suffix}`;

    const client = (key: string, name: string): Client => ({
      id: id(key),
      name,
      industry: null,
      location: null,
      seats: null,
      primaryContact: null,
      contract: null,
      domains: [`${key}.example`],
    });
    const acme = client('acme', 'Acme Accountants');
    const beta = client('beta', 'Beta Builders');
    const link = (c: Client, tool: Tool, externalId: string): ClientLink => ({
      tool,
      externalId,
      clientId: c.id,
      name: c.name,
      url: `https://${tool}.example/${externalId}`,
    });

    const record = (key: string, tool: Tool, clientId: string | null) =>
      ({
        id: id(key),
        kind: 'record',
        clientId,
        tool,
        recordId: key.toUpperCase(),
        recordType: 'Device',
        title: `Record ${key}`,
        recordedAt: at,
        url: `https://${tool}.example/${key}`,
        fields: [{ label: 'OS', value: 'Windows 11' }],
      }) satisfies Source;
    const deviceSource = record('device-src', 'ninjaone', acme.id);
    const device: Device = {
      id: id('device'),
      clientId: acme.id,
      name: 'ACME-PC1',
      type: 'workstation',
      os: 'Windows 11 Pro',
      assignedTo: 'ann',
      lastSeenAt: at,
      patchStatus: 'failed',
      sourceId: deviceSource.id,
    };
    const ticketSource = {
      ...record('ticket-src', 'ninjaone', acme.id),
      recordType: 'Ticket',
    };
    const ticket: Ticket = {
      id: id('ticket'),
      clientId: acme.id,
      number: '4821',
      subject: 'Printer offline',
      status: 'Open',
      open: true,
      urgency: 'high',
      requester: 'Ann Lee',
      assignedTo: null,
      openedAt: at,
      updatedAt: at,
      sourceId: ticketSource.id,
    };
    const alert: AttentionItem = {
      id: id('alert'),
      clientId: acme.id,
      kind: 'alert',
      urgency: 'critical',
      title: 'Disk almost full',
      raisedAt: at,
      sourceIds: [deviceSource.id],
    };
    const recording = record('recording', 'fathom', acme.id);
    const quote: Source = {
      ...record('quote', 'fathom', acme.id),
      kind: 'meeting',
      tool: 'fathom',
      meetingId: id('meeting'),
      transcriptAt: '00:01:02',
      speakerRole: 'client',
      speakerName: 'Ann Lee',
      quote: 'Can you look at the backups?',
    };
    const meeting: Meeting = {
      id: id('meeting'),
      clientId: acme.id,
      title: 'Monthly check-in',
      occurredAt: at,
      durationMinutes: 30,
      attendees: [{ name: 'Ann Lee', role: 'client' }],
      planning: [],
      concerns: [],
      askedFor: [{ text: 'Check the backups', sourceIds: [quote.id] }],
      readAt: null,
      recordingSourceId: recording.id,
    };
    const commitment: Commitment = {
      id: id('commitment'),
      clientId: acme.id,
      statement: 'Check the backups',
      madeAt: at,
      dueOn: '2030-02-01',
      status: 'open',
      completedAt: null,
      sourceIds: [quote.id],
    };
    const none = {
      sources: [],
      devices: [],
      tickets: [],
      meetings: [],
      commitments: [],
      attention: [],
    };

    beforeAll(async () => {
      await getDb().workspaces.create(scratch);
    });

    it('creates a workspace', async () => {
      await expect(getDb().workspaces.get(ws)).resolves.toEqual(scratch);
    });

    it('syncs clients and links, and drops clients no tool links', async () => {
      const db = getDb();
      await db.clients.sync(
        ws,
        'ninjaone',
        {
          clients: [beta, acme],
          links: [link(acme, 'ninjaone', '1'), link(beta, 'ninjaone', '2')],
        },
        at,
      );
      await expect(db.clients.list(ws)).resolves.toEqual([acme, beta]);
      await expect(db.clients.links(ws)).resolves.toEqual([
        link(acme, 'ninjaone', '1'),
        link(beta, 'ninjaone', '2'),
      ]);

      // Hudu links Acme too, and knows where it is.
      const located = { ...acme, location: 'York' };
      await db.clients.sync(
        ws,
        'hudu',
        { clients: [located], links: [link(acme, 'hudu', 'h1')] },
        at,
      );
      await expect(db.clients.get(ws, acme.id)).resolves.toEqual(located);

      // NinjaOne no longer has either: Beta goes, Acme stays for Hudu.
      await db.clients.sync(ws, 'ninjaone', { clients: [], links: [] }, at);
      await expect(db.clients.list(ws)).resolves.toEqual([located]);
      await expect(db.clients.links(ws)).resolves.toEqual([
        link(acme, 'hudu', 'h1'),
      ]);
    });

    it('never overwrites a contract from a sync', async () => {
      const db = getDb();
      const contract = {
        plan: 'Managed',
        startedOn: '2029-01-01',
        renewsOn: '2031-01-01',
        monthlyFee: 1200,
        currency: 'GBP',
        includes: ['Helpdesk'],
      };
      const gamma = { ...client('gamma', 'Gamma Galleries'), contract };
      await db.clients.sync(
        ws,
        'hudu',
        {
          clients: [gamma],
          links: [link(acme, 'hudu', 'h1'), link(gamma, 'hudu', 'h2')],
        },
        at,
      );
      await db.clients.sync(
        ws,
        'hudu',
        {
          clients: [{ ...gamma, contract: null, name: 'Gamma Gallery' }],
          links: [link(acme, 'hudu', 'h1'), link(gamma, 'hudu', 'h2')],
        },
        at,
      );
      await expect(db.clients.get(ws, gamma.id)).resolves.toEqual({
        ...gamma,
        name: 'Gamma Gallery',
      });
    });

    it("replaces one tool's records and leaves the others", async () => {
      const db = getDb();
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource, ticketSource],
        devices: [device],
        tickets: [ticket],
        attention: [alert],
      });
      await db.records.replace(ws, 'fathom', {
        ...none,
        sources: [recording, quote],
        meetings: [meeting],
        commitments: [commitment],
      });

      const sources = await db.sources.listForClient(ws, acme.id);
      expect(z.array(sourceSchema).parse(sources)).toEqual(
        [deviceSource, ticketSource, recording, quote].sort(bySourceRecency),
      );
      await expect(db.devices.list(ws)).resolves.toEqual([device]);
      await expect(db.tickets.list(ws)).resolves.toEqual([ticket]);
      await expect(db.attention.list(ws)).resolves.toEqual([alert]);
      await expect(db.meetings.list(ws)).resolves.toEqual([meeting]);
      await expect(db.commitments.list(ws)).resolves.toEqual([commitment]);

      // A second NinjaOne sync with fewer records swaps only NinjaOne's.
      const healthy = { ...device, patchStatus: 'current' as const };
      const closed = {
        ...ticket,
        status: 'Closed',
        open: false,
        updatedAt: later,
      };
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource, ticketSource],
        devices: [healthy],
        tickets: [closed],
      });
      await expect(db.devices.list(ws)).resolves.toEqual([healthy]);
      await expect(db.tickets.list(ws)).resolves.toEqual([closed]);
      await expect(db.attention.list(ws)).resolves.toEqual([]);
      await expect(db.meetings.list(ws)).resolves.toEqual([meeting]);
      await expect(db.sources.getMany(ws, [quote.id])).resolves.toEqual([
        quote,
      ]);
    });

    it('keeps report questions for every client or one', async () => {
      const db = getDb();
      const everyone = {
        id: id('question-all'),
        clientId: null,
        text: 'Is anyone still on Windows 10?',
        createdAt: at,
      };
      const forAcme = {
        id: id('question-acme'),
        clientId: acme.id,
        text: 'How are the backups of the accounts server doing?',
        createdAt: later,
      };
      await db.reportQuestions.create(ws, forAcme);
      await db.reportQuestions.create(ws, everyone);

      await expect(db.reportQuestions.list(ws)).resolves.toEqual([
        everyone,
        forAcme,
      ]);
      await expect(
        db.reportQuestions.list(ws, { clientId: acme.id }),
      ).resolves.toEqual([everyone, forAcme]);
      await expect(
        db.reportQuestions.list(ws, { clientId: 'someone-else' }),
      ).resolves.toEqual([everyone]);
      await expect(db.reportQuestions.list('elsewhere')).resolves.toEqual([]);

      await expect(
        db.reportQuestions.update(ws, forAcme.id, {
          text: 'Did every backup succeed?',
          clientId: null,
        }),
      ).resolves.toEqual({
        ...forAcme,
        text: 'Did every backup succeed?',
        clientId: null,
      });
      await expect(
        db.reportQuestions.update(ws, 'no-such-question', { text: 'x' }),
      ).resolves.toBeNull();

      await expect(db.reportQuestions.remove(ws, forAcme.id)).resolves.toBe(
        true,
      );
      await expect(db.reportQuestions.remove(ws, forAcme.id)).resolves.toBe(
        false,
      );
      await expect(db.reportQuestions.remove(ws, everyone.id)).resolves.toBe(
        true,
      );
      await expect(db.reportQuestions.list(ws)).resolves.toEqual([]);
    });

    it('saves a report with its sources, and replaces it by ID', async () => {
      const db = getDb();
      const report: Report = {
        id: id('report'),
        clientId: acme.id,
        weekStart: '2029-12-31',
        weekEnd: '2030-01-06',
        status: 'draft',
        generatedAt: at,
        approvedAt: null,
        editedAt: later,
        sentAt: null,
        exceptions: ['Patches failed to install on ACME-PC1'],
        title: 'Acme Accountants weekly report',
        glance: [{ label: 'Devices', value: '1', note: 'none urgent' }],
        sections: [
          {
            kind: 'devices',
            title: 'Devices and patching',
            lines: [
              {
                id: 'line-1',
                text: 'Patches didn’t install on ACME-PC1; we’re on it.',
                original: 'Patches failed to install on ACME-PC1.',
                sourceIds: [deviceSource.id, quote.id],
              },
            ],
          },
        ],
        sources: [deviceSource, quote],
      };
      await db.reports.save(ws, report);
      expect(reportSchema.parse(await db.reports.get(ws, report.id))).toEqual(
        report,
      );

      const redrafted: Report = {
        ...report,
        generatedAt: later,
        editedAt: null,
        exceptions: [],
        sections: [],
        sources: [],
      };
      await db.reports.save(ws, redrafted);
      await expect(db.reports.get(ws, report.id)).resolves.toEqual(redrafted);
      await expect(db.reports.listSummaries(ws)).resolves.toEqual([
        toSummary(redrafted),
      ]);
    });

    it('adds records without touching the rest', async () => {
      const db = getDb();
      const log = {
        ...record('sync-log', 'ninjaone', null),
        recordType: 'Sync log',
      };
      const failing: AttentionItem = {
        id: id('connection'),
        clientId: null,
        kind: 'connection',
        urgency: 'high',
        title: 'NinjaOne has not synced',
        raisedAt: later,
        sourceIds: [log.id],
      };
      await db.records.upsert(ws, 'ninjaone', {
        sources: [log],
        attention: [failing],
      });
      await db.records.upsert(ws, 'ninjaone', {
        sources: [log],
        attention: [{ ...failing, urgency: 'critical' }],
      });
      await expect(db.attention.list(ws)).resolves.toEqual([
        { ...failing, urgency: 'critical' },
      ]);
      await expect(db.devices.list(ws)).resolves.toHaveLength(1);

      // The next good sync clears it.
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource],
        devices: [device],
      });
      await expect(db.attention.list(ws)).resolves.toEqual([]);
      await expect(db.sources.getMany(ws, [log.id])).resolves.toEqual([]);
    });

    it('removes everything a tool wrote, with the clients only it linked', async () => {
      const db = getDb();
      const delta = client('delta', 'Delta Dental');
      await db.clients.sync(
        ws,
        'sharepoint',
        { clients: [delta], links: [link(delta, 'sharepoint', 'f1')] },
        at,
      );
      await db.records.replace(ws, 'sharepoint', {
        ...none,
        sources: [record('file', 'sharepoint', delta.id)],
      });
      // A NinjaOne ticket at Delta goes with Delta; Acme's stays.
      const deltaTicketSource = {
        ...record('delta-ticket-src', 'ninjaone', delta.id),
        recordType: 'Ticket',
      };
      const deltaTicket: Ticket = {
        ...ticket,
        id: id('delta-ticket'),
        clientId: delta.id,
        sourceId: deltaTicketSource.id,
      };
      await db.records.replace(ws, 'ninjaone', {
        ...none,
        sources: [deviceSource, ticketSource, deltaTicketSource],
        devices: [device],
        tickets: [ticket, deltaTicket],
      });

      const deltaRead: AuditEntry = {
        id: id('delta-read'),
        at,
        kind: 'read',
        tool: 'sharepoint',
        what: 'Files',
        clientId: delta.id,
        recordCount: 1,
        outcome: 'ok',
        actor: null,
        ip: null,
      };
      await db.audit.append(ws, [deltaRead]);

      await db.records.removeTool(ws, 'sharepoint');
      await expect(db.clients.get(ws, delta.id)).resolves.toBeNull();
      // The audit log outlives the client.
      await expect(db.audit.list(ws)).resolves.toEqual([deltaRead]);
      await db.audit.prune(ws, later, ['read']);
      await expect(db.sources.getMany(ws, [id('file')])).resolves.toEqual([]);
      await expect(db.devices.list(ws)).resolves.toEqual([device]);
      await expect(db.tickets.list(ws)).resolves.toEqual([ticket]);

      await db.records.removeTool(ws, 'fathom');
      await expect(db.meetings.list(ws)).resolves.toEqual([]);
      await expect(db.commitments.list(ws)).resolves.toEqual([]);
      await expect(db.clients.get(ws, acme.id)).resolves.not.toBeNull();

      await db.records.removeTool(ws, 'ninjaone');
      await expect(db.tickets.list(ws)).resolves.toEqual([]);
      await expect(db.devices.list(ws)).resolves.toEqual([]);
    });

    it('saves, updates and removes a connector, keeping secrets out of lists', async () => {
      const db = getDb();
      const connector: ConnectorRecord = {
        id: id('hudu'),
        tool: 'hudu',
        account: 'scratch.huducloud.com',
        scope: 'Documentation',
        access: 'read: companies, assets',
        status: 'syncing',
        lastSyncAt: null,
        failure: null,
        credentials: 'v1.not-really-encrypted',
        state: { cursor: 'abc' },
      };
      await db.connectors.save(ws, connector);
      await expect(db.connectors.get(ws, 'hudu')).resolves.toEqual(connector);
      const [listed] = await db.connectors.list(ws);
      expect(connectorSchema.strict().parse(listed)).toEqual(
        connectorSchema.parse(connector),
      );
      await expect(db.connectors.listAll()).resolves.toContainEqual({
        workspaceId: ws,
        tool: 'hudu',
      });

      const failure = {
        since: later,
        summary: 'Hudu refused the API key.',
        fix: 'Update the key',
      };
      await expect(
        db.connectors.update(ws, 'hudu', {
          status: 'failing',
          failure,
          state: { cursor: 'def' },
        }),
      ).resolves.toEqual({
        ...connector,
        status: 'failing',
        failure,
        state: { cursor: 'def' },
      });
      await expect(
        db.connectors.update(ws, 'hudu', {
          status: 'healthy',
          failure: null,
          lastSyncAt: later,
        }),
      ).resolves.toMatchObject({
        status: 'healthy',
        failure: null,
        lastSyncAt: later,
      });

      await db.connectors.save(ws, { ...connector, account: 'other.example' });
      await expect(db.connectors.get(ws, 'hudu')).resolves.toEqual({
        ...connector,
        account: 'other.example',
      });

      await db.connectors.remove(ws, 'hudu');
      await expect(db.connectors.get(ws, 'hudu')).resolves.toBeNull();
      await expect(db.connectors.list(ws)).resolves.toEqual([]);
      await expect(
        db.connectors.update(ws, 'hudu', { status: 'healthy' }),
      ).resolves.toBeNull();
    });

    it('appends to and prunes the audit log', async () => {
      const db = getDb();
      const entry = (key: string, when: string): AuditEntry => ({
        id: id(key),
        at: when,
        kind: 'read',
        tool: 'ninjaone',
        what: 'Devices',
        clientId: null,
        recordCount: 12,
        outcome: 'ok',
        actor: null,
        ip: null,
      });
      const sam = demo.users[0]!;
      const signIn: AuditEntry = {
        id: id('s1'),
        at,
        kind: 'sign-in',
        tool: null,
        what: 'Sign-in failed: wrong password',
        clientId: null,
        recordCount: 0,
        outcome: 'failed',
        actor: { userId: sam.id, name: sam.name, email: sam.email },
        ip: '203.0.113.9',
      };
      await db.audit.append(ws, [entry('a1', at), entry('a2', later), signIn]);
      await db.audit.append(ws, []);
      await expect(db.audit.list(ws)).resolves.toEqual([
        entry('a2', later),
        entry('a1', at),
        signIn,
      ]);
      await expect(db.audit.counts(ws)).resolves.toEqual([
        { kind: 'read', tool: 'ninjaone', count: 2 },
        { kind: 'read', tool: 'hudu', count: 0 },
        { kind: 'read', tool: 'sharepoint', count: 0 },
        { kind: 'read', tool: 'fathom', count: 0 },
        { kind: 'sign-in', tool: null, count: 1 },
        { kind: 'change', tool: null, count: 0 },
      ]);
      // Each kind is kept for its own time.
      await db.audit.prune(ws, later, ['read']);
      await expect(db.audit.list(ws)).resolves.toEqual([
        entry('a2', later),
        signIn,
      ]);
      await db.audit.prune(ws, later, ['sign-in', 'change']);
      await expect(db.audit.list(ws)).resolves.toEqual([entry('a2', later)]);
    });

    it('replaces drafts a run made, keeping decided and edited ones', async () => {
      const db = getDb();
      const draft = (key: string, title: string): Recommendation => ({
        id: id(key),
        clientId: acme.id,
        status: 'draft',
        title,
        reason: 'The records say so.',
        createdAt: at,
        decidedAt: null,
        sourceIds: [deviceSource.id],
      });
      const first = [
        draft('rec-1', 'Replace the disk in ACME-PC1'),
        draft('rec-2', 'Call Ann about the backups'),
        draft('rec-3', 'Renew acme.example'),
      ];
      await db.recommendations.replaceDrafts(ws, acme.id, 'run-1', first);
      await expect(
        db.recommendations.list(ws, { clientId: acme.id }),
      ).resolves.toEqual(first);

      // Someone accepts one and rewords another; the next run swaps the third.
      const accepted = await db.recommendations.update(ws, id('rec-1'), {
        status: 'accepted',
        decidedAt: later,
      });
      const reworded = await db.recommendations.update(ws, id('rec-2'), {
        title: 'Call Ann on Monday about the backups',
      });
      const next = [draft('rec-4', 'Test a restore of the file share')];
      await db.recommendations.replaceDrafts(ws, acme.id, 'run-2', next);
      await expect(
        db.recommendations.list(ws, { clientId: acme.id }),
      ).resolves.toEqual([accepted, reworded, ...next]);
    });

    it('keeps the model a workspace chose, and what each run cost', async () => {
      const db = getDb();
      await expect(db.intelligence.model(ws)).resolves.toBeNull();
      await db.intelligence.setModel(ws, 'claude-sonnet-5-5');
      await expect(db.intelligence.model(ws)).resolves.toBe(
        'claude-sonnet-5-5',
      );
      await db.intelligence.setModel(ws, null);
      await expect(db.intelligence.model(ws)).resolves.toBeNull();

      await expect(db.intelligence.preferences(ws)).resolves.toEqual({});
      const preferences = {
        outputs: { ask: false },
        records: { tickets: false, files: false },
      };
      await db.intelligence.setPreferences(ws, preferences);
      await expect(db.intelligence.preferences(ws)).resolves.toEqual(
        preferences,
      );

      const run = (
        key: string,
        startedAt: string,
        clientId: string | null,
      ): IntelligenceRun => ({
        id: id(key),
        clientId,
        kind: 'recommendations',
        inputHash: `hash-${key}`,
        model: 'claude-opus-5-5',
        usage: {
          inputTokens: 1200,
          outputTokens: 2000,
          cacheReadTokens: 0,
          cacheWriteTokens: 20000,
        },
        cost: 0.1448,
        status: 'ok',
        error: null,
        startedAt,
        finishedAt: startedAt,
      });
      const older = run('run-1', at, acme.id);
      const newer = run('run-2', later, acme.id);
      const across = {
        ...run('run-3', later, null),
        kind: 'patterns' as const,
      };
      for (const saved of [older, newer, across]) {
        await db.intelligence.saveRun(ws, saved);
      }
      await expect(
        db.intelligence.lastRun(ws, 'recommendations', acme.id),
      ).resolves.toEqual(newer);
      await expect(
        db.intelligence.lastRun(ws, 'patterns', null),
      ).resolves.toEqual(across);
      await expect(
        db.intelligence.lastRun(ws, 'recommendations', null),
      ).resolves.toBeNull();
      await expect(db.intelligence.runs(ws, later)).resolves.toEqual([
        newer,
        across,
      ]);
      await expect(db.intelligence.runs(ws, at)).resolves.toHaveLength(3);
    });

    it('keeps notes in the inbox until filed, and puts them back when their client goes', async () => {
      const db = getDb();
      const elsewhere = demo.workspace.id;
      const epsilon = client('epsilon', 'Epsilon Engineering');
      await db.clients.sync(
        ws,
        'fathom',
        { clients: [epsilon], links: [link(epsilon, 'fathom', 'e1')] },
        at,
      );
      const note = (
        key: string,
        occurredOn: string,
        clientId: string | null,
      ): MeetingNote => ({
        id: id(key),
        clientId,
        title: `Notes ${key}`,
        occurredOn,
        attendees: ['Ann Price', 'Bo Lee'],
        body: 'They plan to open a second site in March.',
        via: 'paste',
        addedBy: { userId: null, name: 'Sam Okafor' },
        createdAt: at,
        planning: [],
        concerns: [],
        askedFor: [],
        readAt: null,
      });
      const filed = note('note-1', '2030-01-05', epsilon.id);
      const older = note('note-2', '2030-01-03', null);
      const newer = {
        ...note('note-3', '2030-01-04', null),
        via: 'email' as const,
        attendees: [],
      };
      for (const added of [filed, older, newer]) {
        await db.notes.add(ws, added, null);
      }

      await expect(db.notes.list(ws, epsilon.id)).resolves.toEqual([filed]);
      await expect(db.notes.list(ws, null)).resolves.toEqual([newer, older]);
      await expect(db.notes.get(ws, newer.id)).resolves.toEqual(newer);
      await expect(db.notes.get(elsewhere, filed.id)).resolves.toBeNull();
      await expect(db.notes.list(elsewhere, null)).resolves.toEqual([]);

      const moved = { ...older, clientId: epsilon.id };
      await expect(
        db.notes.file(ws, older.id, epsilon.id, null),
      ).resolves.toEqual(moved);
      await expect(db.notes.list(ws, epsilon.id)).resolves.toEqual([
        filed,
        moved,
      ]);
      await expect(
        db.notes.file(ws, id('no-note'), null, null),
      ).resolves.toBeNull();
      await expect(
        db.notes.file(elsewhere, older.id, null, null),
      ).resolves.toBeNull();

      // No tool links Epsilon now, so it goes; its notes wait in the inbox.
      await db.clients.sync(ws, 'fathom', { clients: [], links: [] }, at);
      await expect(db.clients.get(ws, epsilon.id)).resolves.toBeNull();
      await expect(db.notes.list(ws, null)).resolves.toEqual([
        { ...filed, clientId: null },
        newer,
        { ...older, clientId: null },
      ]);

      await expect(db.notes.remove(elsewhere, newer.id)).resolves.toBe(false);
      await expect(db.notes.remove(ws, newer.id)).resolves.toBe(true);
      await expect(db.notes.remove(ws, newer.id)).resolves.toBe(false);
      await expect(db.notes.get(ws, newer.id)).resolves.toBeNull();
    });

    it('keeps what was read from a meeting across syncs, and forgets it once the meeting has gone a while', async () => {
      const db = getDb();
      const fathom = {
        ...none,
        sources: [recording, quote],
        meetings: [meeting],
        commitments: [commitment],
      };
      const read: MeetingPointsRecord = {
        id: meeting.id,
        subject: 'meeting',
        inputHash: 'hash-1',
        status: 'ok',
        runId: 'run-1',
        planning: [
          { text: 'Opening a second site', sourceIds: [recording.id] },
        ],
        concerns: [],
        askedFor: [],
        attemptedAt: later,
        readAt: later,
      };
      await db.records.replace(ws, 'fathom', fathom);
      await db.meetingPoints.save(ws, acme.id, read, []);
      await expect(
        db.meetingPoints.states(ws, [meeting.id, id('no-meeting')]),
      ).resolves.toEqual([read]);
      const asRead = {
        ...meeting,
        planning: read.planning,
        concerns: [],
        askedFor: [],
        readAt: later,
      };
      await expect(db.meetings.list(ws)).resolves.toEqual([asRead]);

      // Each sync deletes and reinserts the meeting; what was read stays.
      await db.records.replace(ws, 'fathom', fathom);
      await expect(db.meetings.list(ws)).resolves.toEqual([asRead]);

      // Gone from one read, back in the next: nothing lost.
      await db.records.replace(ws, 'fathom', { ...fathom, meetings: [] });
      await db.meetingPoints.prune(ws, '2030-01-03T00:00:00.000Z', at);
      await db.records.replace(ws, 'fathom', fathom);
      await db.meetingPoints.prune(
        ws,
        '2030-01-20T00:00:00.000Z',
        '2030-01-10T00:00:00.000Z',
      );
      await expect(db.meetingPoints.states(ws, [meeting.id])).resolves.toEqual([
        read,
      ]);

      // Gone for longer than the grace period: forgotten.
      await db.records.replace(ws, 'fathom', { ...fathom, meetings: [] });
      await db.meetingPoints.prune(ws, '2030-01-21T00:00:00.000Z', at);
      await db.meetingPoints.prune(
        ws,
        '2030-02-01T00:00:00.000Z',
        '2030-01-25T00:00:00.000Z',
      );
      await expect(db.meetingPoints.states(ws, [meeting.id])).resolves.toEqual(
        [],
      );
      await db.records.replace(ws, 'fathom', fathom);
      await expect(db.meetings.list(ws)).resolves.toEqual([meeting]);
    });

    it('cites filed notes, keeps what was read from them, and starts over when they move', async () => {
      const db = getDb();
      const noteId = id('note-read');
      const cite = (key: string, quote: string | null): NoteSource => ({
        id: id(key),
        clientId: acme.id,
        kind: 'note',
        tool: null,
        noteId,
        quote,
        recordId: noteId,
        recordType: 'Meeting notes',
        title: 'Quarterly review',
        recordedAt: at,
        url: `https://dossier.example/clients/${acme.id}/meetings#${noteId}`,
        fields: [],
      });
      const notes: MeetingNote = {
        id: noteId,
        clientId: acme.id,
        title: 'Quarterly review',
        occurredOn: '2030-01-06',
        attendees: ['Ann Lee'],
        body: 'They plan to move their files to the cloud.',
        via: 'paste',
        addedBy: { userId: null, name: 'Sam Okafor' },
        createdAt: at,
        planning: [],
        concerns: [],
        askedFor: [],
        readAt: null,
      };
      const whole = cite('note-whole', null);
      const excerpt = cite('note-quote', 'move their files to the cloud');
      await db.notes.add(ws, notes, whole);
      await expect(db.sources.getMany(ws, [whole.id])).resolves.toEqual([
        whole,
      ]);

      const read: MeetingPointsRecord = {
        id: noteId,
        subject: 'note',
        inputHash: 'hash-2',
        status: 'ok',
        runId: 'run-2',
        planning: [
          { text: 'Moving files to the cloud', sourceIds: [excerpt.id] },
        ],
        concerns: [],
        askedFor: [],
        attemptedAt: later,
        readAt: later,
      };
      await db.meetingPoints.save(ws, acme.id, read, [excerpt]);
      const asRead = { ...notes, planning: read.planning, readAt: later };
      await expect(db.notes.get(ws, noteId)).resolves.toEqual(asRead);
      await expect(db.notes.list(ws, acme.id)).resolves.toContainEqual(asRead);
      await expect(
        db.sources.getMany(ws, [whole.id, excerpt.id]),
      ).resolves.toEqual([whole, excerpt]);

      // Syncs replace what a tool wrote; notes belong to none.
      await db.records.replace(ws, 'fathom', {
        ...none,
        sources: [recording, quote],
        meetings: [meeting],
        commitments: [commitment],
      });
      await expect(
        db.sources.getMany(ws, [whole.id, excerpt.id]),
      ).resolves.toEqual([whole, excerpt]);

      // A read for a client the notes have left isn't saved.
      await db.meetingPoints.save(
        ws,
        id('someone-else'),
        { ...read, inputHash: 'hash-3' },
        [],
      );
      await expect(db.meetingPoints.states(ws, [noteId])).resolves.toEqual([
        read,
      ]);

      // A failed read keeps the excerpts the last good one cites.
      const failed = {
        ...read,
        status: 'failed' as const,
        inputHash: 'hash-4',
        attemptedAt: '2030-01-03T00:00:00.000Z',
      };
      await db.meetingPoints.save(ws, acme.id, failed, null);
      await expect(db.meetingPoints.states(ws, [noteId])).resolves.toEqual([
        failed,
      ]);
      await expect(
        db.sources.getMany(ws, [whole.id, excerpt.id]),
      ).resolves.toEqual([whole, excerpt]);

      // Back to the inbox: what was cited and read goes with the client.
      await expect(db.notes.file(ws, noteId, null, null)).resolves.toEqual({
        ...notes,
        clientId: null,
      });
      await expect(
        db.sources.getMany(ws, [whole.id, excerpt.id]),
      ).resolves.toEqual([]);
      await expect(db.meetingPoints.states(ws, [noteId])).resolves.toEqual([]);

      // Filed again and cited afresh; deleting the notes takes the sources.
      await db.notes.file(ws, noteId, acme.id, whole);
      await expect(db.sources.getMany(ws, [whole.id])).resolves.toEqual([
        whole,
      ]);
      await db.meetingPoints.save(ws, acme.id, read, [excerpt]);
      await expect(db.notes.remove(ws, noteId)).resolves.toBe(true);
      await expect(
        db.sources.getMany(ws, [whole.id, excerpt.id]),
      ).resolves.toEqual([]);
      await expect(db.meetingPoints.states(ws, [noteId])).resolves.toEqual([]);
    });

    it('keeps one forwarding token per workspace, and finds it from any', async () => {
      const db = getDb();
      const token = `${ws}-inbox`;
      await expect(db.notes.inboxToken(ws, token, at)).resolves.toBe(token);
      await expect(db.notes.inboxToken(ws, `${ws}-other`, later)).resolves.toBe(
        token,
      );
      await expect(db.notes.inboxWorkspace(token)).resolves.toBe(ws);
      await expect(db.notes.inboxWorkspace(`${ws}-other`)).resolves.toBeNull();
    });

    it('keeps report settings, and drafts each week once on schedule', async () => {
      const db = getDb();
      const elsewhere = demo.workspace.id;
      await expect(db.reportSettings.get(ws)).resolves.toBeNull();
      // Nothing to note until there are settings.
      await expect(
        db.reportSettings.markDrafted(ws, '2030-01-07'),
      ).resolves.toBe(false);

      const settings: StoredReportSettings = {
        senderName: 'Northwind IT',
        replyTo: 'help@northwind.example',
        brandColour: '#1f6feb',
        logo: { type: 'image/png', base64: 'iVBORw0KGgo=' },
        draftAt: { weekday: 5, hour: 7 },
        sendAt: null,
        sendFrom: null,
      };
      await db.reportSettings.save(ws, settings);
      await expect(db.reportSettings.get(ws)).resolves.toEqual(settings);
      await expect(db.reportSettings.get(elsewhere)).resolves.not.toEqual(
        settings,
      );
      expect(await db.reportSettings.listScheduled()).toContain(ws);

      await expect(
        db.reportSettings.markDrafted(ws, '2030-01-07'),
      ).resolves.toBe(true);
      await expect(
        db.reportSettings.markDrafted(ws, '2030-01-07'),
      ).resolves.toBe(false);
      // Saving the settings again keeps which week was drafted.
      const sending: StoredReportSettings = {
        ...settings,
        logo: null,
        sendAt: { weekday: 5, hour: 16 },
        sendFrom: later,
      };
      await db.reportSettings.save(ws, sending);
      await expect(db.reportSettings.get(ws)).resolves.toEqual(sending);
      await expect(
        db.reportSettings.markDrafted(ws, '2030-01-07'),
      ).resolves.toBe(false);
      await expect(
        db.reportSettings.markDrafted(ws, '2030-01-14'),
      ).resolves.toBe(true);

      await db.reportSettings.save(ws, {
        ...sending,
        draftAt: null,
        sendAt: null,
        sendFrom: null,
      });
      expect(await db.reportSettings.listScheduled()).not.toContain(ws);
    });

    it('sends a report once, to its client’s recipients, and logs each try', async () => {
      const db = getDb();
      const elsewhere = demo.workspace.id;
      const zeta = client('zeta', 'Zeta Zoology');
      await db.clients.sync(
        ws,
        'fathom',
        { clients: [zeta], links: [link(zeta, 'fathom', 'z1')] },
        at,
      );

      const people: Recipient[] = [
        { name: 'Zoe Park', email: 'zoe@zeta.example', copy: false },
        { name: '', email: 'office@zeta.example', copy: true },
      ];
      await expect(db.recipients.list(ws, zeta.id)).resolves.toEqual([]);
      await db.recipients.replace(ws, zeta.id, people);
      await expect(db.recipients.list(ws, zeta.id)).resolves.toEqual(people);
      await db.recipients.replace(ws, zeta.id, [people[1]!, people[0]!]);
      await expect(db.recipients.list(ws, zeta.id)).resolves.toEqual([
        people[1],
        people[0],
      ]);
      await expect(db.recipients.list(elsewhere, zeta.id)).resolves.toEqual([]);
      // Not a client of this workspace: nothing is saved.
      await db.recipients.replace(ws, id('no-client'), people);
      await expect(db.recipients.list(ws, id('no-client'))).resolves.toEqual(
        [],
      );

      const report: Report = {
        id: id('zeta-report'),
        clientId: zeta.id,
        weekStart: '2030-01-07',
        weekEnd: '2030-01-13',
        status: 'draft',
        generatedAt: at,
        approvedAt: null,
        editedAt: null,
        sentAt: null,
        exceptions: [],
        title: 'Zeta Zoology weekly report',
        glance: [],
        sections: [],
        sources: [],
      };
      await db.reports.save(ws, report);
      // Only an approved report can go.
      await expect(db.reports.markSent(ws, report.id, later)).resolves.toBe(
        false,
      );
      await db.reports.setStatus(ws, [report.id], 'approved', at);
      await expect(
        db.reports.markSent(elsewhere, report.id, later),
      ).resolves.toBe(false);
      await expect(db.reports.markSent(ws, report.id, later)).resolves.toBe(
        true,
      );
      await expect(db.reports.markSent(ws, report.id, later)).resolves.toBe(
        false,
      );
      // Sent, it stays approved whatever's asked.
      await expect(
        db.reports.setStatus(ws, [report.id], 'draft', later),
      ).resolves.toEqual([]);
      await expect(db.reports.get(ws, report.id)).resolves.toMatchObject({
        status: 'approved',
        approvedAt: at,
        sentAt: later,
      });
      await db.reports.clearSent(ws, report.id);
      await expect(db.reports.get(ws, report.id)).resolves.toMatchObject({
        sentAt: null,
      });

      const failed: DeliveryRecord = {
        id: id('delivery-1'),
        reportId: report.id,
        clientId: zeta.id,
        at,
        to: ['zoe@zeta.example'],
        cc: ['office@zeta.example'],
        outcome: 'failed',
        problem: 'Couldn’t reach Postmark to send the email.',
        sentBy: null,
        messageId: null,
      };
      const sent: DeliveryRecord = {
        ...failed,
        id: id('delivery-2'),
        at: later,
        outcome: 'sent',
        problem: null,
        sentBy: { userId: null, name: 'Sam Okafor' },
        messageId: 'pm-123',
      };
      await db.deliveries.add(ws, failed);
      await db.deliveries.add(ws, sent);
      const strip = ({ messageId: _messageId, ...delivery }: DeliveryRecord) =>
        delivery;
      await expect(db.deliveries.list(ws, report.id)).resolves.toEqual([
        strip(sent),
        strip(failed),
      ]);
      await expect(db.deliveries.list(elsewhere, report.id)).resolves.toEqual(
        [],
      );

      // No tool links Zeta now, so it goes, with its recipients and log.
      await db.clients.sync(ws, 'fathom', { clients: [], links: [] }, at);
      await expect(db.recipients.list(ws, zeta.id)).resolves.toEqual([]);
      await expect(db.deliveries.list(ws, report.id)).resolves.toEqual([]);
    });

    it('keeps a contract someone entered, and its documents, until the client goes', async () => {
      const db = getDb();
      const elsewhere = demo.workspace.id;
      const eta = client('eta', 'Eta Estates');
      const sync = (name: string) =>
        db.clients.sync(
          ws,
          'fathom',
          {
            clients: [{ ...eta, name }],
            links: [link(eta, 'fathom', 'eta')],
          },
          at,
        );
      await sync('Eta Estates');

      const contract = {
        plan: 'Managed Plus',
        startedOn: '2029-04-01',
        renewsOn: '2031-03-31',
        monthlyFee: 1450.5,
        currency: 'GBP',
        includes: ['Helpdesk', 'Patching'],
      };
      await expect(
        db.clients.setContract(ws, eta.id, contract),
      ).resolves.toEqual({ ...eta, contract });
      await expect(
        db.clients.setContract(ws, id('no-client'), contract),
      ).resolves.toBeNull();
      await expect(
        db.clients.setContract(elsewhere, eta.id, contract),
      ).resolves.toBeNull();
      // A sync changes the name and keeps the contract.
      await sync('Eta Estate Agents');
      await expect(db.clients.get(ws, eta.id)).resolves.toMatchObject({
        name: 'Eta Estate Agents',
        contract,
      });

      const file = (key: string, uploadedAt: string): ContractDocument => ({
        id: id(key),
        clientId: eta.id,
        name: `${key}.pdf`,
        contentType: 'application/pdf',
        size: 9,
        uploadedAt,
        uploadedBy: { userId: null, name: 'Sam Okafor' },
      });
      const signed = file('signed', at);
      const renewal = file('renewal', later);
      const bytes = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0, 1, 254, 255,
      ]);
      await db.contractDocuments.add(ws, signed, bytes);
      await db.contractDocuments.add(ws, renewal, bytes.slice().reverse());
      await expect(db.contractDocuments.list(ws, eta.id)).resolves.toEqual([
        renewal,
        signed,
      ]);
      const got = await db.contractDocuments.get(ws, signed.id);
      expect(got?.document).toEqual(signed);
      expect([...got!.content]).toEqual([...bytes]);
      await expect(
        db.contractDocuments.get(elsewhere, signed.id),
      ).resolves.toBeNull();
      await expect(
        db.contractDocuments.list(elsewhere, eta.id),
      ).resolves.toEqual([]);

      await expect(
        db.contractDocuments.remove(elsewhere, signed.id),
      ).resolves.toBe(false);
      await expect(db.contractDocuments.remove(ws, signed.id)).resolves.toBe(
        true,
      );
      await expect(db.contractDocuments.remove(ws, signed.id)).resolves.toBe(
        false,
      );

      await expect(db.clients.setContract(ws, eta.id, null)).resolves.toEqual({
        ...eta,
        name: 'Eta Estate Agents',
        contract: null,
      });
      // No tool links Eta now, so it goes, with its documents.
      await db.clients.sync(ws, 'fathom', { clients: [], links: [] }, at);
      await expect(
        db.contractDocuments.get(ws, renewal.id),
      ).resolves.toBeNull();
    });

    it('keeps questions and answers, newest first, and stops changing an answer once it’s written', async () => {
      const db = getDb();
      const elsewhere = demo.workspace.id;
      const [sam, priya] = [demo.users[0]!, demo.users[1]!];
      const question = (
        key: string,
        askedAt: string,
        userId: string,
      ): AskAnswer => ({
        id: id(key),
        question: `What about ${key}?`,
        status: 'answering',
        answered: null,
        askedBy: { userId, name: 'Someone' },
        clients: [],
        askedAt,
        finishedAt: null,
        lines: [],
        sources: [],
        model: null,
        cost: null,
        error: null,
      });
      const summary = ({
        lines: _lines,
        sources: _sources,
        model: _model,
        cost: _cost,
        error: _error,
        ...rest
      }: AskAnswer) => rest;
      const first = question('ask-first', at, sam.id);
      const second = question('ask-second', later, priya.id);
      await db.ask.create(ws, first);
      await db.ask.create(ws, second);
      await expect(db.ask.list(ws, { limit: 10 })).resolves.toEqual([
        summary(second),
        summary(first),
      ]);
      await expect(
        db.ask.list(ws, { askedBy: sam.id, limit: 10 }),
      ).resolves.toEqual([summary(first)]);
      await expect(db.ask.list(ws, { limit: 1 })).resolves.toEqual([
        summary(second),
      ]);
      const theirs = await db.ask.list(elsewhere, { limit: 100 });
      expect(theirs.map((answer) => answer.id)).not.toContain(first.id);
      await expect(db.ask.get(elsewhere, first.id)).resolves.toBeNull();

      // The clients it reads as it goes, then the answer.
      const clients = [{ id: acme.id, name: acme.name }];
      await expect(db.ask.update(ws, first.id, { clients })).resolves.toBe(
        true,
      );
      const answer = {
        status: 'answered',
        answered: true,
        clients,
        lines: [
          { text: 'Acme’s disk is almost full.', sourceIds: [deviceSource.id] },
        ],
        sources: [deviceSource],
        model: 'claude-opus-5-5',
        cost: 0.4321,
        error: null,
        finishedAt: later,
      } satisfies AskChanges;
      await expect(db.ask.update(ws, first.id, answer)).resolves.toBe(true);
      await expect(db.ask.get(ws, first.id)).resolves.toEqual({
        ...first,
        ...answer,
      });
      // Written: nothing changes it now, nor from another workspace.
      await expect(
        db.ask.update(ws, first.id, { status: 'failed', error: 'Too late' }),
      ).resolves.toBe(false);
      await expect(
        db.ask.update(elsewhere, second.id, { status: 'failed' }),
      ).resolves.toBe(false);
      await expect(db.ask.get(ws, second.id)).resolves.toEqual(second);

      await expect(db.ask.remove(elsewhere, second.id)).resolves.toBe(false);
      await expect(db.ask.remove(ws, second.id)).resolves.toBe(true);
      await expect(db.ask.get(ws, second.id)).resolves.toBeNull();
      await expect(db.ask.remove(ws, second.id)).resolves.toBe(false);
    });

    it('swaps every pattern at once, keeping their order', async () => {
      const db = getDb();
      const pattern = (key: string): Pattern => ({
        id: id(key),
        title: `Pattern ${key}`,
        why: 'Both clients have it.',
        suggestion: 'Fix it once for both.',
        clients: [
          {
            clientId: acme.id,
            detail: 'At Acme',
            sourceIds: [deviceSource.id],
          },
          {
            clientId: beta.id,
            detail: 'At Beta',
            sourceIds: [ticketSource.id],
          },
        ],
        createdAt: at,
      });
      const [one, two, three] = ['one', 'two', 'three'].map((key) =>
        pattern(`pattern-${key}`),
      ) as [Pattern, Pattern, Pattern];
      await db.patterns.replace(ws, [two, one]);
      await expect(db.patterns.list(ws)).resolves.toEqual([two, one]);
      await db.patterns.replace(ws, [three]);
      await expect(db.patterns.list(ws)).resolves.toEqual([three]);
      const theirs = await db.patterns.list(demo.workspace.id);
      expect(theirs.map((p) => p.id)).not.toContain(three.id);
      await db.patterns.replace(ws, []);
      await expect(db.patterns.list(ws)).resolves.toEqual([]);
    });
  });
}

/** The outbox and notifications, in a scratch workspace with an owner of its own. */
function describeEventsAndNotifications(getDb: () => DatabaseAdapter) {
  describe('events and notifications (scratch workspace)', () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const workspace = {
      id: `${SCRATCH_PREFIX}events-${suffix}`,
      name: 'Events',
      timeZone: 'UTC',
    };
    const ws = workspace.id;
    const owner = {
      id: `${SCRATCH_PREFIX}usr-events-${suffix}`,
      email: `events-${suffix}@example.com`,
      name: 'Eve Events',
      title: '',
      passwordHash: 'not-a-real-hash',
    };
    // Someone in the demo workspace, which has a user row to point at.
    const other = demo.users[0]!.id;
    const elsewhere = demo.workspace.id;
    // Long ago, so claims never reach a developer's own pending events.
    const t = (time: string) => `2000-01-01T${time}.000Z`;
    const event = (
      key: string,
      time: string,
      dedupeKey: string | null = null,
    ) => ({
      id: `${ws}-${key}`,
      type: 'connection.failing',
      actorUserId: null,
      payload: { tool: 'hudu', problem: `Problem ${key}`, needsSettings: true },
      dedupeKey,
      occurredAt: t(time),
    });

    beforeAll(async () => {
      await getDb().users.createOwner(workspace, owner);
    });

    it('records an event once per key, and claims due ones until they’re handled', async () => {
      const db = getDb();
      const first = event('first', '00:00:00');
      const second = event('second', '00:01:00', 'hudu-failing');
      await expect(db.events.append(ws, first)).resolves.toBe(true);
      await expect(db.events.append(ws, second)).resolves.toBe(true);
      await expect(
        db.events.append(ws, event('again', '00:01:30', 'hudu-failing')),
      ).resolves.toBe(false);
      // Keys are per workspace.
      await expect(
        db.events.append(elsewhere, {
          ...event('elsewhere', '00:01:30', 'hudu-failing'),
          id: `${ws}-elsewhere`,
        }),
      ).resolves.toBe(true);

      const claimed = await db.events.claim(t('00:00:30'), t('00:10:00'), 10);
      expect(claimed).toEqual([{ ...first, workspaceId: ws, attempts: 1 }]);
      // Held: nobody else gets it, and the second isn't due yet.
      await expect(
        db.events.claim(t('00:00:30'), t('00:10:00'), 10),
      ).resolves.toEqual([]);
      const next = await db.events.claim(t('00:01:30'), t('00:10:00'), 10);
      expect(next.map((e) => e.id).sort(compareText)).toEqual(
        [`${ws}-elsewhere`, second.id].sort(compareText),
      );
      await db.events.markDispatched(
        elsewhere,
        `${ws}-elsewhere`,
        t('00:02:00'),
      );

      await db.events.retry(ws, first.id, t('00:20:00'), 'Mail was down');
      await db.events.markDispatched(ws, second.id, t('00:02:00'));
      await expect(
        db.events.claim(t('00:15:00'), t('00:30:00'), 10),
      ).resolves.toEqual([]);
      await expect(
        db.events.claim(t('00:20:00'), t('00:30:00'), 10),
      ).resolves.toEqual([{ ...first, workspaceId: ws, attempts: 2 }]);
      await db.events.markFailed(ws, first.id, t('00:21:00'), 'Gave up');
      await expect(
        db.events.claim(t('01:00:00'), t('01:10:00'), 10),
      ).resolves.toEqual([]);

      // A claim that lapses lets the event be claimed again.
      const third = event('third', '00:30:00');
      await db.events.append(ws, third);
      await expect(
        db.events.claim(t('00:30:00'), t('00:31:00'), 10),
      ).resolves.toEqual([{ ...third, workspaceId: ws, attempts: 1 }]);
      await expect(
        db.events.claim(t('00:31:00'), t('00:32:00'), 10),
      ).resolves.toEqual([{ ...third, workspaceId: ws, attempts: 2 }]);

      // Pruning drops handled events (freeing their keys) and keeps pending ones.
      await db.events.prune(ws, t('23:00:00'));
      await expect(
        db.events.append(ws, event('later', '00:40:00', 'hudu-failing')),
      ).resolves.toBe(true);
      const left = await db.events.claim(t('00:45:00'), t('00:50:00'), 10);
      expect(left.map((e) => e.id)).toEqual([third.id, `${ws}-later`]);
      for (const e of left)
        await db.events.markDispatched(ws, e.id, t('00:46:00'));
    });

    it('keeps one notification per person per event, a page at a time, until read', async () => {
      const db = getDb();
      const note = (
        key: string,
        eventId: string,
        userId: string,
        time: string,
        channels = { inApp: true, email: false },
      ): NotificationRecord => ({
        id: `${ws}-ntf-${key}`,
        eventId: `${ws}-${eventId}`,
        userId,
        type: 'connection.failing',
        title: `Notification ${key}`,
        body: 'What happened.',
        link: '/connections',
        createdAt: t(time),
        readAt: null,
        ...channels,
        emailSentAt: null,
      });
      const older = note('older', 'a', owner.id, '01:00:00');
      const newer = note('newer', 'b', owner.id, '02:00:00', {
        inApp: true,
        email: true,
      });
      const emailOnly = note('email', 'c', owner.id, '03:00:00', {
        inApp: false,
        email: true,
      });
      const theirs = note('theirs', 'a', other, '01:00:00');
      await db.notifications.add(ws, [older, newer, emailOnly, theirs]);
      // The same event for the same person again changes nothing.
      await db.notifications.add(ws, [
        { ...note('dupe', 'b', owner.id, '04:00:00'), title: 'Again' },
      ]);

      await expect(db.notifications.list(ws, owner.id)).resolves.toEqual([
        newer,
        older,
      ]);
      await expect(
        db.notifications.list(ws, owner.id, { limit: 1 }),
      ).resolves.toEqual([newer]);
      await expect(
        db.notifications.list(ws, owner.id, {
          before: { at: newer.createdAt, id: newer.id },
        }),
      ).resolves.toEqual([older]);
      await expect(db.notifications.list(elsewhere, owner.id)).resolves.toEqual(
        [],
      );
      await expect(db.notifications.countUnread(ws, owner.id)).resolves.toBe(2);
      await expect(db.notifications.forEvent(ws, `${ws}-a`)).resolves.toEqual(
        [older, theirs].sort(byNotification),
      );

      // Only their own, and only unread ones, are marked.
      await expect(
        db.notifications.markRead(
          ws,
          owner.id,
          [older.id, theirs.id],
          t('05:00:00'),
        ),
      ).resolves.toBe(1);
      await expect(
        db.notifications.list(ws, owner.id, { unread: true }),
      ).resolves.toEqual([newer]);
      await expect(
        db.notifications.markRead(ws, owner.id, 'all', t('05:00:00')),
      ).resolves.toBe(1);
      await expect(db.notifications.countUnread(ws, owner.id)).resolves.toBe(0);
      await expect(db.notifications.countUnread(ws, other)).resolves.toBe(1);
      await expect(
        db.notifications.markRead(ws, owner.id, [], t('05:00:00')),
      ).resolves.toBe(0);

      // An email goes once: claimed, then sent; a failed send lets it go again.
      const stale = t('00:00:00');
      await expect(
        db.notifications.claimEmail(ws, older.id, t('06:00:00'), stale),
      ).resolves.toBe(false);
      await expect(
        db.notifications.claimEmail(ws, emailOnly.id, t('06:00:00'), stale),
      ).resolves.toBe(true);
      await expect(
        db.notifications.claimEmail(ws, emailOnly.id, t('06:00:01'), stale),
      ).resolves.toBe(false);
      await db.notifications.releaseEmail(ws, emailOnly.id);
      await expect(
        db.notifications.claimEmail(ws, emailOnly.id, t('06:01:00'), stale),
      ).resolves.toBe(true);
      await db.notifications.markEmailed(ws, emailOnly.id, t('06:01:01'));
      await expect(
        db.notifications.claimEmail(
          ws,
          emailOnly.id,
          t('07:00:00'),
          t('07:00:00'),
        ),
      ).resolves.toBe(false);
      expect(
        (await db.notifications.forEvent(ws, `${ws}-c`))[0]?.emailSentAt,
      ).toBe(t('06:01:01'));
      // A claim older than `staleBefore` was abandoned, so it can be taken.
      await expect(
        db.notifications.claimEmail(ws, newer.id, t('08:00:00'), stale),
      ).resolves.toBe(true);
      await expect(
        db.notifications.claimEmail(ws, newer.id, t('09:00:00'), t('08:30:00')),
      ).resolves.toBe(true);

      await db.notifications.prune(ws, t('01:30:00'));
      await expect(db.notifications.forEvent(ws, `${ws}-a`)).resolves.toEqual(
        [],
      );
      await expect(db.notifications.list(ws, owner.id)).resolves.toHaveLength(
        1,
      );
    });

    it('keeps what each member wants to hear about', async () => {
      const db = getDb();
      await expect(db.notifications.preferences(ws)).resolves.toEqual({});
      const chosen = { 'report.sent': { email: true } };
      await expect(
        db.notifications.setPreferences(ws, owner.id, chosen),
      ).resolves.toBe(true);
      await expect(db.notifications.preferences(ws)).resolves.toEqual({
        [owner.id]: chosen,
      });
      // Not a member there, or not anyone.
      await expect(
        db.notifications.setPreferences(elsewhere, owner.id, chosen),
      ).resolves.toBe(false);
      await expect(
        db.notifications.setPreferences(ws, `${ws}-nobody`, chosen),
      ).resolves.toBe(false);
      expect(await db.notifications.preferences(elsewhere)).not.toHaveProperty(
        owner.id,
      );
    });
  });
}
