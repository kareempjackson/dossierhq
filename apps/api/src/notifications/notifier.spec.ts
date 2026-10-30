import type { DomainEvent } from '@dossierhq/contracts';
import type { DatabaseAdapter } from '@dossierhq/database';
import { createMemoryAdapter } from '@dossierhq/database/memory';
import { demo, DEMO_EMAIL, TECHNICIAN_EMAIL } from '@dossierhq/fixtures';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Clock } from '../common/clock.js';
import type { AppConfig } from '../config/configuration.js';
import { EventBus, type RecordedEvent } from '../events/event-bus.js';
import { LogMailer, MailError } from '../mail/mailer.js';
import { describe as describeEvent } from './describe.js';
import { Notifier } from './notifier.js';

const ws = demo.workspace.id;
const NOW = '2026-10-09T15:40:00.000Z';
const sam = demo.users.find((u) => u.email === DEMO_EMAIL)!;
const priya = demo.users.find((u) => u.email === TECHNICIAN_EMAIL)!;

function setup() {
  const db: DatabaseAdapter = createMemoryAdapter(demo);
  const clock = { now: () => NOW } as Clock;
  const config = {
    get: (key: string) =>
      key === 'WEB_URL'
        ? 'https://dossier.test'
        : key === 'NOTIFICATION_DAYS'
          ? 90
          : 0,
  } as unknown as ConfigService<AppConfig, true>;
  const mailer = new LogMailer('Dossier <dossier@localhost>');
  const notifier = new Notifier(
    db,
    mailer,
    new EventBus(db, clock),
    clock,
    config,
  );
  /** Who has a notification of the event, and who was emailed it. */
  const outcome = async (id: string) => {
    const stored = await db.notifications.forEvent(ws, id);
    return {
      to: stored.map((n) => n.userId).sort(),
      emailed: mailer.outbox
        .filter((m) => m.tag === 'notification')
        .flatMap((m) => m.to)
        .sort(),
    };
  };
  return { db, mailer, notifier, outcome };
}

const recorded = (
  event: DomainEvent,
  actorUserId: string | null = null,
): RecordedEvent => ({
  id: `evt-${randomUUID()}`,
  workspaceId: ws,
  actorUserId,
  occurredAt: NOW,
  attempts: 1,
  event,
});

const failedSend: DomainEvent = {
  type: 'report.delivery-failed',
  reportId: 'copperleaf-studio-2026-w41',
  clientId: 'copperleaf-studio',
  weekStart: '2026-10-05',
  problem: 'Postmark rejected the server token.',
  scheduled: true,
};

describe('Notifier', () => {
  it('tells admins about connections, and everyone but the actor about reports', async () => {
    const { notifier, outcome } = setup();
    const stopped = recorded({
      type: 'connection.failing',
      tool: 'hudu',
      problem: 'Hudu turned down the API key.',
      needsSettings: true,
    });
    await notifier.notify(stopped);
    await expect(outcome(stopped.id)).resolves.toEqual({
      to: [sam.id],
      emailed: [sam.email],
    });

    const sent = recorded(
      {
        type: 'report.sent',
        reportId: 'copperleaf-studio-2026-w41',
        clientId: 'copperleaf-studio',
        weekStart: '2026-10-05',
        to: ['hello@copperleaf.example'],
        scheduled: false,
      },
      sam.id,
    );
    await notifier.notify(sent);
    // Sent reports aren't emailed unless someone asks.
    await expect(outcome(sent.id)).resolves.toEqual({
      to: [priya.id],
      emailed: [sam.email],
    });
  });

  it('follows what each person chose, but always emails them about their own sign-in', async () => {
    const { db, notifier, outcome } = setup();
    await db.notifications.setPreferences(ws, priya.id, {
      'report.delivery-failed': { inApp: false, email: false },
      'security.two-factor-off': { inApp: false, email: false },
    });
    const failed = recorded(failedSend);
    await notifier.notify(failed);
    await expect(outcome(failed.id)).resolves.toEqual({
      to: [sam.id],
      emailed: [sam.email],
    });

    // She did it herself, and turned it off, but hears about it by email.
    const off = recorded(
      { type: 'security.two-factor-off', userId: priya.id },
      priya.id,
    );
    await notifier.notify(off);
    const [only] = await db.notifications.forEvent(ws, off.id);
    expect(only).toMatchObject({ userId: priya.id, inApp: false, email: true });
    await expect(db.notifications.list(ws, priya.id)).resolves.toEqual([]);
    expect((await outcome(off.id)).emailed).toContain(priya.email);
  });

  it('adds nothing and emails nobody again when an event is handled twice', async () => {
    const { mailer, notifier, outcome } = setup();
    const failed = recorded(failedSend);
    await notifier.notify(failed);
    await notifier.notify({ ...failed, attempts: 2 });
    await expect(outcome(failed.id)).resolves.toEqual({
      to: [priya.id, sam.id].sort(),
      emailed: [priya.email, sam.email].sort(),
    });
    expect(mailer.outbox).toHaveLength(2);
  });

  it('after a failed send, emails only those who didn’t get it', async () => {
    const { mailer, notifier, outcome } = setup();
    const send = mailer.send.bind(mailer);
    vi.spyOn(mailer, 'send')
      .mockImplementationOnce(send)
      .mockRejectedValueOnce(new MailError('Postmark is down.'));
    const failed = recorded(failedSend);
    await expect(notifier.notify(failed)).rejects.toThrow('Postmark is down.');
    expect((await outcome(failed.id)).emailed).toHaveLength(1);

    await notifier.notify({ ...failed, attempts: 2 });
    await expect(outcome(failed.id)).resolves.toMatchObject({
      emailed: [priya.email, sam.email].sort(),
    });
  });

  it('emails what happened, with a link to it and to the settings', async () => {
    const { mailer, notifier } = setup();
    await notifier.notify(recorded(failedSend));
    const mail = mailer.outbox[0]!;
    expect(mail).toMatchObject({
      subject: 'Copperleaf Studio’s weekly report couldn’t be sent',
      tag: 'notification',
    });
    expect(mail.text).toContain(
      'Open in Dossier: https://dossier.test/reports/copperleaf-studio-2026-w41',
    );
    expect(mail.text).toContain(`part of ${demo.workspace.name} on Dossier`);
    expect(mail.html).toContain(
      'href="https://dossier.test/settings#notifications"',
    );
  });
});

describe('describe', () => {
  const context = {
    clientName: 'Copperleaf Studio',
    actorName: 'Sam Okafor',
    recipientId: priya.id,
    timeZone: 'Europe/London',
  };

  it('counts drafts and the ones that need a look', () => {
    const drafted = (count: number, flagged: number) =>
      describeEvent(
        {
          type: 'reports.drafted',
          weekStart: '2026-10-05',
          count,
          flagged,
          scheduled: true,
        },
        context,
      );
    expect(drafted(1, 0)).toEqual({
      title: '1 weekly report drafted for the week of 5 Oct 2026',
      body: 'Ready to review and approve.',
      link: '/reports',
    });
    expect(drafted(12, 1).body).toBe(
      '1 needs a closer look before it can be approved.',
    );
    expect(drafted(12, 3).body).toBe(
      '3 need a closer look before they can be approved.',
    );
  });

  it('speaks to the person a role change is about', () => {
    const changed = {
      type: 'member.role-changed' as const,
      userId: priya.id,
      name: priya.name,
      from: 'technician' as const,
      to: 'admin' as const,
    };
    expect(describeEvent(changed, context).title).toBe('You’re now an admin');
    expect(
      describeEvent(changed, { ...context, recipientId: sam.id }).title,
    ).toBe(`${priya.name} is now an admin`);
  });

  it('says when a connection stopped, in the workspace’s time', () => {
    expect(
      describeEvent(
        {
          type: 'connection.recovered',
          tool: 'ninjaone',
          failingSince: '2026-10-08T22:29:00.000Z',
        },
        context,
      ).body,
    ).toBe('It had stopped since 8 Oct, 23:29.');
  });
});
