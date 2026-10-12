import type { Dataset } from './index.js';

/**
 * Renders a dataset as INSERT statements for the schema in
 * supabase/migrations. Used to generate supabase/seed.sql.
 */
export function toSeedSql(data: Dataset): string {
  const ws = data.workspace.id;
  const tables: [string, string[], unknown[][]][] = [
    [
      'workspaces',
      ['id', 'name', 'user_name', 'user_role', 'time_zone'],
      [
        [
          ws,
          data.workspace.name,
          data.workspace.user.name,
          data.workspace.user.role,
          data.workspace.timeZone,
        ],
      ],
    ],
    [
      'clients',
      [
        'id',
        'workspace_id',
        'name',
        'industry',
        'location',
        'seats',
        'contact_name',
        'contact_role',
        'contract_plan',
        'contract_started_on',
        'contract_renews_on',
        'contract_monthly_fee',
        'contract_currency',
        'contract_includes',
      ],
      data.clients.map((c) => [
        c.id,
        ws,
        c.name,
        c.industry,
        c.location,
        c.seats,
        c.primaryContact.name,
        c.primaryContact.role,
        c.contract.plan,
        c.contract.startedOn,
        c.contract.renewsOn,
        c.contract.monthlyFee,
        c.contract.currency,
        textArray(c.contract.includes),
      ]),
    ],
    [
      'client_views',
      ['workspace_id', 'client_id', 'viewed_at'],
      data.clientViews.map((v) => [ws, v.clientId, v.viewedAt]),
    ],
    [
      'sources',
      [
        'id',
        'workspace_id',
        'client_id',
        'kind',
        'tool',
        'record_id',
        'record_type',
        'title',
        'recorded_at',
        'url',
        'fields',
        'meeting_id',
        'transcript_at',
        'speaker_role',
        'speaker_name',
        'quote',
      ],
      data.sources.map((s) => [
        s.id,
        ws,
        s.clientId,
        s.kind,
        s.tool,
        s.recordId,
        s.recordType,
        s.title,
        s.recordedAt,
        s.url,
        json(s.fields),
        s.kind === 'meeting' ? s.meetingId : null,
        s.kind === 'meeting' ? s.transcriptAt : null,
        s.kind === 'meeting' ? s.speakerRole : null,
        s.kind === 'meeting' ? s.speakerName : null,
        s.kind === 'meeting' ? s.quote : null,
      ]),
    ],
    [
      'attention_items',
      [
        'id',
        'workspace_id',
        'client_id',
        'kind',
        'urgency',
        'title',
        'raised_at',
        'source_ids',
      ],
      data.attentionItems.map((a) => [
        a.id,
        ws,
        a.clientId,
        a.kind,
        a.urgency,
        a.title,
        a.raisedAt,
        textArray(a.sourceIds),
      ]),
    ],
    [
      'recommendations',
      [
        'id',
        'workspace_id',
        'client_id',
        'status',
        'title',
        'reason',
        'created_at',
        'decided_at',
        'source_ids',
      ],
      data.recommendations.map((r) => [
        r.id,
        ws,
        r.clientId,
        r.status,
        r.title,
        r.reason,
        r.createdAt,
        r.decidedAt,
        textArray(r.sourceIds),
      ]),
    ],
    [
      'commitments',
      [
        'id',
        'workspace_id',
        'client_id',
        'statement',
        'made_at',
        'due_on',
        'status',
        'completed_at',
        'source_ids',
      ],
      data.commitments.map((c) => [
        c.id,
        ws,
        c.clientId,
        c.statement,
        c.madeAt,
        c.dueOn,
        c.status,
        c.completedAt,
        textArray(c.sourceIds),
      ]),
    ],
    [
      'meetings',
      [
        'id',
        'workspace_id',
        'client_id',
        'title',
        'occurred_at',
        'duration_minutes',
        'attendees',
        'planning',
        'concerns',
        'asked_for',
        'recording_source_id',
      ],
      data.meetings.map((m) => [
        m.id,
        ws,
        m.clientId,
        m.title,
        m.occurredAt,
        m.durationMinutes,
        json(m.attendees),
        json(m.planning),
        json(m.concerns),
        json(m.askedFor),
        m.recordingSourceId,
      ]),
    ],
    [
      'devices',
      [
        'id',
        'workspace_id',
        'client_id',
        'name',
        'type',
        'os',
        'assigned_to',
        'last_seen_at',
        'patch_status',
        'source_id',
      ],
      data.devices.map((d) => [
        d.id,
        ws,
        d.clientId,
        d.name,
        d.type,
        d.os,
        d.assignedTo,
        d.lastSeenAt,
        d.patchStatus,
        d.sourceId,
      ]),
    ],
    [
      'reports',
      [
        'id',
        'workspace_id',
        'client_id',
        'week_start',
        'week_end',
        'status',
        'generated_at',
        'approved_at',
        'exceptions',
        'title',
        'glance',
        'sections',
      ],
      data.reports.map((r) => [
        r.id,
        ws,
        r.clientId,
        r.weekStart,
        r.weekEnd,
        r.status,
        r.generatedAt,
        r.approvedAt,
        textArray(r.exceptions),
        r.title,
        json(r.glance),
        json(r.sections),
      ]),
    ],
    [
      'connectors',
      [
        'id',
        'workspace_id',
        'tool',
        'scope',
        'access',
        'status',
        'last_sync_at',
        'failure',
      ],
      data.connectors.map((c) => [
        c.id,
        ws,
        c.tool,
        c.scope,
        c.access,
        c.status,
        c.lastSyncAt,
        c.failure ? json(c.failure) : null,
      ]),
    ],
    [
      'audit_entries',
      ['id', 'workspace_id', 'at', 'tool', 'read', 'client_id', 'record_count'],
      data.auditLog.map((e) => [
        e.id,
        ws,
        e.at,
        e.tool,
        e.read,
        e.clientId,
        e.recordCount,
      ]),
    ],
  ];

  const statements = tables.flatMap(([table, columns, rows]) => {
    const chunks: string[] = [];
    for (let i = 0; i < rows.length; i += 200) {
      const values = rows
        .slice(i, i + 200)
        .map((row) => `  (${row.map(literal).join(', ')})`)
        .join(',\n');
      chunks.push(
        `insert into public.${table} (${columns.join(', ')}) values\n${values};`,
      );
    }
    return chunks;
  });

  return [
    '-- Generated by `pnpm db:seed` from @dossierhq/fixtures. Do not edit by hand.',
    '-- Runs after migrations on `supabase db reset`.',
    '',
    ...statements,
    '',
  ].join('\n');
}

const RAW = Symbol('raw');
type Raw = { [RAW]: string };

const raw = (sql: string): Raw => ({ [RAW]: sql });
const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
const json = (value: unknown) => raw(`${quote(JSON.stringify(value))}::jsonb`);
const textArray = (values: string[]) =>
  raw(
    values.length === 0
      ? `'{}'::text[]`
      : `array[${values.map(quote).join(', ')}]::text[]`,
  );

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object' && RAW in value) return (value as Raw)[RAW];
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return quote(String(value));
}
