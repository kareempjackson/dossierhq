import {
  INTELLIGENCE_OUTPUTS,
  INTELLIGENCE_RECORDS,
  INTELLIGENCE_TOPICS,
  INTELLIGENCE_KIND_NAMES,
  MEMORY_KIND_NAMES,
  NOTIFICATION_CATEGORIES,
  PROVIDERS,
  READING_DEFAULT_MODEL,
  costOf,
  modelInfo,
  modelsOf,
  providerInfo,
  type IntelligenceSettings,
  type IntelligenceSpend,
  type Invite,
  type Member,
  type MemoryKind,
  type MemoryStatus,
  type NotificationSetting,
  type ProviderId,
  type WorkspaceRole,
} from '@dossierhq/contracts';
import { dayMonth } from './format';

/**
 * Settings and Intelligence as the screens show them, from the API's
 * answers. Pure, and server-side: client components import only its types,
 * so the contracts and zod stay out of the browser.
 */

type When = { timeZone: string; now: Date };

const number = new Intl.NumberFormat('en-GB');

export const dollars = (value: number) => `$${value.toFixed(2)}`;

/** What one run costs, as a model card shows it. */
const perRun = (cost: number) => (cost < 0.01 ? 'Under $0.01' : dollars(cost));

/** "A, B and C". */
const andList = (items: string[]) =>
  items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    : (items[0] ?? '');

// Notifications ---------------------------------------------------------------

export type NotificationRow = {
  type: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  /** Channels that stay on whatever the person chooses. */
  locked: { inApp: boolean; email: boolean };
};

export type NotificationGroup = {
  id: string;
  name: string;
  description: string;
  events: NotificationRow[];
};

/** The person's events by category, in Settings' order; empty ones dropped. */
export function notificationGroups(
  settings: NotificationSetting[],
): NotificationGroup[] {
  return NOTIFICATION_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    events: settings
      .filter((setting) => setting.category === category.id)
      .map((setting) => ({
        type: setting.type,
        label: setting.label,
        description: setting.description,
        inApp: setting.inApp,
        email: setting.email,
        locked: {
          inApp: setting.locked.includes('inApp'),
          email: setting.locked.includes('email'),
        },
      })),
  })).filter((group) => group.events.length > 0);
}

// People ----------------------------------------------------------------------

export type RoleName = 'Owner' | 'Admin' | 'Technician';

const ROLE_NAMES: Record<WorkspaceRole, RoleName> = {
  owner: 'Owner',
  admin: 'Admin',
  technician: 'Technician',
};

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  level: WorkspaceRole;
  you: boolean;
  /**
   * The roles you can give them, theirs included, when you can change their
   * role or remove them; null when you can't, and always for yourself.
   */
  roles: { value: WorkspaceRole; label: RoleName }[] | null;
};

/**
 * What the API lets `viewer` do to someone who is `role`: owners and admins
 * manage people, and only owners make, change or remove owners.
 */
function rolesFor(
  viewer: WorkspaceRole,
  role: WorkspaceRole,
): WorkspaceRole[] | null {
  if (viewer === 'owner') return ['owner', 'admin', 'technician'];
  if (viewer === 'admin' && role !== 'owner') return ['admin', 'technician'];
  return null;
}

export type InviteRow = {
  id: string;
  email: string;
  role: RoleName;
  /** "link works until 18 Nov", or that it no longer does. */
  expires: string;
  expired: boolean;
};

/** Everyone in the workspace: you first, then by name. */
export function memberRows(
  members: Member[],
  you: { id: string; role: WorkspaceRole },
): MemberRow[] {
  return members
    .map((member) => {
      const yours = member.id === you.id;
      const roles = yours ? null : rolesFor(you.role, member.role);
      return {
        id: member.id,
        name: member.name || member.email,
        email: member.email,
        role: ROLE_NAMES[member.role],
        level: member.role,
        you: yours,
        roles:
          roles?.map((value) => ({ value, label: ROLE_NAMES[value] })) ?? null,
      };
    })
    .sort(
      (a, b) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name),
    );
}

/** Invites not yet accepted, newest first, as the API lists them. */
export function inviteRows(invites: Invite[], { timeZone, now }: When) {
  return invites.map((invite): InviteRow => {
    const expired = Date.parse(invite.expiresAt) <= now.getTime();
    return {
      id: invite.id,
      email: invite.email,
      role: ROLE_NAMES[invite.role],
      expires: expired
        ? 'link expired'
        : `link works until ${dayMonth(invite.expiresAt, timeZone, now)}`,
      expired,
    };
  });
}

// AI model ----------------------------------------------------------------------

export type ModelCard = {
  id: string;
  name: string;
  summary: string;
  note?: string;
  /** Dollars per million tokens: input, output, cache read, cache write. */
  prices: [number, number, number, number];
  /** About what one run costs on it, e.g. "$0.16"; see ModelChoice.per. */
  cost: string;
};

export type ProviderModels = {
  id: ProviderId;
  name: string;
  product: string;
  /** There's a key to run its models on: the workspace's own, or Dossier's. */
  usable: boolean;
  models: ModelCard[];
};

export type ModelChoice = {
  /** Drafting for clients, or reading each ticket and person. */
  use: 'drafting' | 'reading';
  /** What a card's cost is for: "a client" or "a ticket". */
  per: string;
  providers: ProviderModels[];
  /** The model running now. */
  inUse: string;
  /** What choosing nothing runs. */
  defaultModel: string;
  /** Why nothing drafts, when nothing can. */
  off: string | null;
  /** Why the model chosen isn't the one running, when it isn't. */
  note: string | null;
};

/** Providers whose models can run: the workspace's keys, then Dossier's. */
const usableProviders = (settings: IntelligenceSettings) =>
  new Set<ProviderId>([
    ...settings.keys.map((key) => key.provider),
    ...settings.dossierKeys,
  ]);

/** Every model by provider, with its price and what one run of `usage` costs. */
function providerModels(
  settings: IntelligenceSettings,
  usage: IntelligenceSettings['typicalRun'],
): ProviderModels[] {
  const usable = usableProviders(settings);
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    name: provider.name,
    product: provider.product,
    usable: usable.has(provider.id),
    models: modelsOf(provider.id).map((model) => ({
      id: model.id,
      name: model.name,
      summary: model.summary,
      note: model.note,
      prices: [
        model.prices.input,
        model.prices.output,
        model.prices.cacheRead,
        model.prices.cacheWrite,
      ],
      cost: perRun(costOf(usage, model.id)),
    })),
  }));
}

/** The model Dossier drafts with, and what drafting for a client costs. */
export function modelChoice(settings: IntelligenceSettings): ModelChoice {
  return {
    use: 'drafting',
    per: 'a client',
    providers: providerModels(settings, settings.typicalRun),
    inUse: settings.model,
    defaultModel: settings.defaultModel,
    off: settings.enabled ? null : settings.off,
    note: null,
  };
}

/**
 * The model that reads each ticket and person, and what a read costs.
 * Choosing nothing reads with the drafting provider's cheaper model.
 */
export function readingChoice(settings: IntelligenceSettings): ModelChoice {
  const chosen = settings.readingChosen;
  return {
    use: 'reading',
    per: 'a ticket',
    providers: providerModels(settings, settings.typicalRead),
    inUse: settings.readingModel,
    defaultModel: READING_DEFAULT_MODEL[modelInfo(settings.model).provider],
    off: null,
    note:
      chosen && chosen !== settings.readingModel
        ? `You chose ${modelInfo(chosen).name}, but there’s no ${providerInfo(modelInfo(chosen).provider).name} key to run it on, so Dossier reads with ${modelInfo(settings.readingModel).name}.`
        : null,
  };
}

// API keys ----------------------------------------------------------------------

export type KeyRow = {
  provider: ProviderId;
  name: string;
  product: string;
  placeholder: string;
  keysUrl: string;
  /** "GPT-6 Astra, GPT-6.1 Sol and GPT-6 Luna". */
  models: string;
  /** The workspace's own key, never the key itself. */
  key: { hint: string; addedBy: string; addedOn: string } | null;
  /** Its models run on Dossier's key while the workspace has none. */
  dossiers: boolean;
};

export function keyRows(
  settings: IntelligenceSettings,
  { timeZone, now }: When,
): KeyRow[] {
  return PROVIDERS.map((provider) => {
    const key = settings.keys.find((each) => each.provider === provider.id);
    return {
      provider: provider.id,
      name: provider.name,
      product: provider.product,
      placeholder: provider.keyPlaceholder,
      keysUrl: provider.keysUrl,
      models: andList(modelsOf(provider.id).map((model) => model.name)),
      key: key
        ? {
            hint: key.hint,
            addedBy: key.addedBy,
            addedOn: dayMonth(key.addedAt, timeZone, now),
          }
        : null,
      dossiers: settings.dossierKeys.includes(provider.id),
    };
  });
}

// Spend -------------------------------------------------------------------------

const KIND_NAMES = INTELLIGENCE_KIND_NAMES;

export type SpendRow = {
  kind: string;
  what: string;
  runs: number;
  tokensRead: string;
  /** Percent of what it read that came from the cache; null when it can't cache. */
  fromCache: number | null;
  tokensWritten: string;
  cost: number;
};

export type SpendView = {
  /** The costliest first. */
  rows: SpendRow[];
  total: number;
  runs: number;
  /** Percent of every token read that came from the cache. */
  fromCache: number | null;
};

/** Embeddings have no prompt cache. */
const cacheable = (row: IntelligenceSpend) => row.kind !== 'embeddings';

/** Every token the model read, fresh or from the cache. */
const read = (row: IntelligenceSpend) =>
  row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;

const percent = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 100);

export function spendView(spend: IntelligenceSpend[]): SpendView {
  const rows = [...spend].sort((a, b) => b.cost - a.cost);
  const cached = rows.filter(cacheable);
  return {
    rows: rows.map((row) => ({
      kind: row.kind,
      what: KIND_NAMES[row.kind],
      runs: row.runs,
      tokensRead: number.format(read(row)),
      fromCache: cacheable(row)
        ? percent(row.cacheReadTokens, read(row))
        : null,
      tokensWritten: number.format(row.outputTokens),
      cost: row.cost,
    })),
    total: rows.reduce((sum, row) => sum + row.cost, 0),
    runs: rows.reduce((sum, row) => sum + row.runs, 0),
    fromCache: percent(
      cached.reduce((sum, row) => sum + row.cacheReadTokens, 0),
      cached.reduce((sum, row) => sum + read(row), 0),
    ),
  };
}

// Intelligence page -------------------------------------------------------------

export type SwitchGroup = 'outputs' | 'topics' | 'records';

export type Toggle = {
  id: string;
  label: string;
  detail?: string;
  on: boolean;
  /** Not something Dossier can do yet. */
  soon?: boolean;
};

export type IntelligenceView = {
  model: {
    name: string;
    /** "Dossier’s key", or the workspace's own. */
    key: string;
    perClient: string;
    last30Days: string;
    runs: number;
  };
  /** Why nothing drafts, when nothing can. */
  off: string | null;
  /** Who the records go to: "Anthropic". */
  provider: string;
  drafts: Toggle[];
  lookFor: Toggle[];
  reads: Toggle[];
};

export function intelligenceView(
  settings: IntelligenceSettings,
): IntelligenceView {
  const model = modelInfo(settings.model);
  const own = settings.keys.find((key) => key.provider === model.provider);
  const { preferences } = settings;
  const spend = spendView(settings.spend);
  return {
    model: {
      name: model.name,
      key: own
        ? `your ${providerInfo(model.provider).name} key ending ${own.hint}`
        : settings.dossierKeys.includes(model.provider)
          ? 'Dossier’s key'
          : 'no key yet',
      perClient: perRun(costOf(settings.typicalRun, settings.model)),
      last30Days: dollars(spend.total),
      runs: spend.runs,
    },
    off: settings.enabled ? null : settings.off,
    provider: providerInfo(model.provider).name,
    drafts: INTELLIGENCE_OUTPUTS.map((output) => ({
      id: output.id,
      label: output.name,
      detail: output.description,
      on: preferences.outputs[output.id],
      soon: !output.available || undefined,
    })),
    lookFor: INTELLIGENCE_TOPICS.map((topic) => ({
      id: topic.id,
      label: topic.name,
      on: preferences.topics[topic.id],
    })),
    reads: INTELLIGENCE_RECORDS.map((record) => ({
      id: record.id,
      label: record.name,
      detail: record.from,
      on: preferences.records[record.id],
    })),
  };
}

// Memory ------------------------------------------------------------------------

export type MemoryView = {
  /** Something is remembered. */
  any: boolean;
  /** Each kind remembered, e.g. "Ticket conversations" and "214". */
  kinds: { name: string; count: string }[];
  /** "3,410 passages, 2,980 of them found by meaning." */
  passages: string;
  /** "Goes back to 3 Mar 2025."; null when nothing is remembered. */
  since: string | null;
  /** How past records are found, in a sentence. */
  meaning: string;
  /** A read of past records is under way. */
  backfilling: boolean;
};

const MEANING: Record<MemoryStatus['embeddings'], string> = {
  on: 'Dossier finds related records by meaning as well as by their words.',
  off: 'Find by meaning is off, so Dossier finds past records by their words alone.',
  unavailable:
    'Finding by meaning isn’t set up on this Dossier, so it finds past records by their words alone.',
};

/** What Dossier remembers of past records, as the Intelligence page shows it. */
export function memoryView(
  status: MemoryStatus,
  { timeZone, now }: When,
): MemoryView {
  const kinds = (Object.keys(MEMORY_KIND_NAMES) as MemoryKind[])
    .map((kind) => ({
      name: MEMORY_KIND_NAMES[kind],
      count: status.documents[kind] ?? 0,
    }))
    .filter((kind) => kind.count > 0);
  const passages = `${number.format(status.chunks)} ${status.chunks === 1 ? 'passage' : 'passages'}`;
  return {
    any: kinds.length > 0,
    kinds: kinds.map((kind) => ({
      name: kind.name,
      count: number.format(kind.count),
    })),
    passages:
      status.embeddings === 'on'
        ? `${passages}, ${number.format(status.embedded)} of them found by meaning.`
        : `${passages}.`,
    since: status.oldestAt
      ? `Goes back to ${dayMonth(status.oldestAt, timeZone, now)}.`
      : null,
    meaning: MEANING[status.embeddings],
    backfilling: status.backfilling,
  };
}
