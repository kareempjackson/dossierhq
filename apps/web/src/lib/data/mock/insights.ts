import type {
  AttentionItem,
  Commitment,
  Recommendation,
} from '@dossierhq/contracts';

export const attentionItems: AttentionItem[] = [
  {
    id: 'att-mf-ransomware',
    clientId: 'marlow-freight',
    kind: 'alert',
    urgency: 'critical',
    title:
      'Ransomware behaviour was blocked on a dispatch laptop, which is still isolated',
    raisedAt: '2026-10-09T07:52:00.000Z',
    sourceIds: ['src-mf-alert-48177'],
  },
  {
    id: 'att-hd-backups',
    clientId: 'harbour-dental',
    kind: 'alert',
    urgency: 'critical',
    title: 'File server backups have failed three nights running',
    raisedAt: '2026-10-09T01:14:00.000Z',
    sourceIds: ['src-hd-alert-48213', 'src-hd-alert-48164'],
  },
  {
    id: 'att-nl-mfa',
    clientId: 'northside-legal',
    kind: 'commitment',
    urgency: 'high',
    title:
      'MFA for remote staff was promised by 2 Oct and 9 accounts still lack it',
    raisedAt: '2026-10-03T08:00:00.000Z',
    sourceIds: ['src-nl-call-mfa-promise', 'src-nl-hudu-mfa'],
  },
  {
    id: 'att-hudu-sync',
    clientId: null,
    kind: 'connection',
    urgency: 'high',
    title: 'Hudu has not synced since 23:14 on 8 Oct',
    raisedAt: '2026-10-08T22:29:00.000Z',
    sourceIds: ['src-hudu-sync-log'],
  },
  {
    id: 'att-csc-disk',
    clientId: 'cedar-street-clinic',
    kind: 'alert',
    urgency: 'high',
    title:
      'The SQL server’s data disk is 94% full and fills in about three weeks',
    raisedAt: '2026-10-09T05:30:00.000Z',
    sourceIds: ['src-csc-alert-48190'],
  },
  {
    id: 'att-nl-renewal',
    clientId: 'northside-legal',
    kind: 'risk',
    urgency: 'high',
    title:
      'The contract renews on 30 Nov and Tom is reviewing every supplier first',
    raisedAt: '2026-10-06T10:09:00.000Z',
    sourceIds: ['src-nl-call-review', 'src-nl-contract'],
  },
  {
    id: 'att-mf-depot',
    clientId: 'marlow-freight',
    kind: 'risk',
    urgency: 'normal',
    title: 'A new depot opens in January and has no network plan yet',
    raisedAt: '2026-10-02T13:31:00.000Z',
    sourceIds: ['src-mf-call-depot', 'src-mf-floorplan'],
  },
  {
    id: 'att-hd-restore',
    clientId: 'harbour-dental',
    kind: 'commitment',
    urgency: 'normal',
    title: 'A restore test was promised before 31 Oct and is not booked yet',
    raisedAt: '2026-09-30T13:16:00.000Z',
    sourceIds: ['src-hd-call-restore-promise'],
  },
  {
    id: 'att-lq-renewal',
    clientId: 'lindqvist-engineering',
    kind: 'risk',
    urgency: 'normal',
    title: 'The contract renews on 31 Oct with no renewal meeting booked',
    raisedAt: '2026-10-01T09:00:00.000Z',
    sourceIds: ['src-lq-contract'],
  },
  {
    id: 'att-hd-windows10',
    clientId: 'harbour-dental',
    kind: 'risk',
    urgency: 'normal',
    title: 'Two reception PCs still run Windows 10, which is out of support',
    raisedAt: '2026-10-07T08:00:00.000Z',
    sourceIds: ['src-hd-device-rec01', 'src-hd-device-rec02'],
  },
  {
    id: 'att-bh-chromebooks',
    clientId: 'bramble-hill-school',
    kind: 'commitment',
    urgency: 'normal',
    title: 'Year 7 Chromebooks were promised before half term on 23 Oct',
    raisedAt: '2026-09-15T09:19:00.000Z',
    sourceIds: ['src-bh-call-chromebooks'],
  },
  {
    id: 'att-sv-firewall',
    clientId: 'saltmarsh-veterinary',
    kind: 'risk',
    urgency: 'normal',
    title: 'Firewall firmware is two releases behind',
    raisedAt: '2026-10-05T08:40:00.000Z',
    sourceIds: ['src-sv-hudu-firewall'],
  },
];

export const recommendations: Recommendation[] = [
  {
    id: 'rec-hd-restore-test',
    clientId: 'harbour-dental',
    status: 'draft',
    title: 'Run a restore test of the imaging share this week',
    reason:
      'Backups have failed three nights running, and Priya asked for a restore test before the end of the month.',
    createdAt: '2026-10-09T06:00:00.000Z',
    sourceIds: ['src-hd-alert-48213', 'src-hd-call-restore-ask'],
  },
  {
    id: 'rec-hd-surgery-seven',
    clientId: 'harbour-dental',
    status: 'draft',
    title: 'Order the surgery seven workstation and camera now',
    reason:
      'Surgery seven opens in November and Priya wants a workstation and camera ready before then; lead times are about three weeks.',
    createdAt: '2026-10-01T07:00:00.000Z',
    sourceIds: ['src-mtg-hd-0930-000510'],
  },
  {
    id: 'rec-mf-depot-network',
    clientId: 'marlow-freight',
    status: 'draft',
    title: 'Scope the Eastleigh depot network and quote by 31 Oct',
    reason:
      'Gareth said the depot opens in January and asked for network and wi-fi costs by the end of the month.',
    createdAt: '2026-10-05T12:00:00.000Z',
    sourceIds: ['src-mf-call-depot', 'src-mf-floorplan'],
  },
  {
    id: 'rec-nl-mfa-date',
    clientId: 'northside-legal',
    status: 'draft',
    title: 'Send Tom a firm MFA completion date before the supplier review',
    reason:
      'MFA was promised by 2 Oct, 9 accounts still lack it, and Tom is reviewing suppliers before the 30 Nov renewal.',
    createdAt: '2026-10-06T12:00:00.000Z',
    sourceIds: [
      'src-nl-call-mfa-promise',
      'src-nl-hudu-mfa',
      'src-nl-call-review',
    ],
  },
  {
    id: 'rec-csc-extend-disk',
    clientId: 'cedar-street-clinic',
    status: 'draft',
    title: 'Extend the SQL data disk by 200 GB',
    reason:
      'The disk is 94% full and grows about 2 GB a week, so it fills in roughly three weeks.',
    createdAt: '2026-10-09T06:00:00.000Z',
    sourceIds: ['src-csc-alert-48190'],
  },
];

// Commitments ---------------------------------------------------------------
// What the MSP told each client it would do, from meeting transcripts.

export const commitments: Commitment[] = [
  {
    id: 'cmt-hd-restore',
    clientId: 'harbour-dental',
    statement:
      'Run a full restore test of the imaging share before 31 Oct and send Priya the results',
    madeAt: '2026-09-30T13:16:05.000Z',
    dueOn: '2026-10-31',
    status: 'open',
    completedAt: null,
    sourceIds: ['src-hd-call-restore-promise'],
  },
  {
    id: 'cmt-hd-quote',
    clientId: 'harbour-dental',
    statement: 'Send a quote for two new reception PCs by 9 Oct',
    madeAt: '2026-09-30T13:28:20.000Z',
    dueOn: '2026-10-09',
    status: 'done',
    completedAt: '2026-10-06T10:12:00.000Z',
    sourceIds: ['src-hd-call-quote-promise', 'src-hd-quote-q2291'],
  },
  {
    id: 'cmt-hd-sspr',
    clientId: 'harbour-dental',
    statement: 'Turn on self-service password reset for the reception team',
    madeAt: '2026-09-02T13:21:30.000Z',
    dueOn: '2026-09-30',
    status: 'done',
    completedAt: '2026-09-12T15:00:00.000Z',
    sourceIds: ['src-hd-call-sspr-promise'],
  },
  {
    id: 'cmt-nl-mfa',
    clientId: 'northside-legal',
    statement: 'Put MFA on every remote account by 2 Oct',
    madeAt: '2026-09-18T09:52:10.000Z',
    dueOn: '2026-10-02',
    status: 'open',
    completedAt: null,
    sourceIds: ['src-nl-call-mfa-promise', 'src-nl-hudu-mfa'],
  },
  {
    id: 'cmt-nl-sharepoint',
    clientId: 'northside-legal',
    statement:
      'Have the conveyancing SharePoint site ready in the first week of October',
    madeAt: '2026-09-18T09:37:05.000Z',
    dueOn: '2026-10-09',
    status: 'done',
    completedAt: '2026-10-07T17:20:00.000Z',
    sourceIds: ['src-nl-call-sp-promise', 'src-nl-sp-site'],
  },
  {
    id: 'cmt-mf-depot',
    clientId: 'marlow-freight',
    statement:
      'Send a network design and costs for the Eastleigh depot before 31 Oct',
    madeAt: '2026-10-02T13:33:00.000Z',
    dueOn: '2026-10-31',
    status: 'open',
    completedAt: null,
    sourceIds: ['src-mf-call-depot-promise'],
  },
  {
    id: 'cmt-bh-chromebooks',
    clientId: 'bramble-hill-school',
    statement: 'Enrol all Year 7 Chromebooks before half term on 23 Oct',
    madeAt: '2026-09-15T09:19:40.000Z',
    dueOn: '2026-10-23',
    status: 'open',
    completedAt: null,
    sourceIds: ['src-bh-call-chromebooks'],
  },
];
