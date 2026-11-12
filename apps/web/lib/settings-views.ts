import {
  INTELLIGENCE_OUTPUTS,
  INTELLIGENCE_RECORDS,
  INTELLIGENCE_TOPICS,
  NOTIFICATION_CATEGORIES,
  PROVIDERS,
  costOf,
  modelInfo,
  modelsOf,
  providerInfo,
  type IntelligenceKind,
  type IntelligenceSettings,
  type IntelligenceSpend,
  type Invite,
  type Member,
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
  you: boolean;
};

export type InviteRow = {
  id: string;
  email: string;
  role: RoleName;
  /** "link works until 18 Nov", or that it no longer does. */
  expires: string;
  expired: boolean;
};

/** Everyone in the workspace: you first, then by name. */
export function memberRows(members: Member[], youId: string): MemberRow[] {
  return members
    .map((member) => ({
      id: member.id,
      name: member.name || member.email,
      email: member.email,
      role: ROLE_NAMES[member.role],
      you: member.id === youId,
    }))
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
  /** About what drafting for one client costs on it, e.g. "$0.16". */
  perClient: string;
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
  providers: ProviderModels[];
  /** The model drafting now. */
  inUse: string;
  defaultModel: string;
  /** Why nothing drafts, when nothing can. */
  off: string | null;
};

/** Providers whose models can run: the workspace's keys, then Dossier's. */
const usableProviders = (settings: IntelligenceSettings) =>
  new Set<ProviderId>([
    ...settings.keys.map((key) => key.provider),
    ...settings.dossierKeys,
  ]);

/** Every model by provider, with its price and what a client run costs on it. */
export function modelChoice(settings: IntelligenceSettings): ModelChoice {
  const usable = usableProviders(settings);
  return {
    providers: PROVIDERS.map((provider) => ({
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
        perClient: perRun(costOf(settings.typicalRun, model.id)),
      })),
    })),
    inUse: settings.model,
    defaultModel: settings.defaultModel,
    off: settings.enabled ? null : settings.off,
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

const KIND_NAMES: Record<IntelligenceKind, string> = {
  recommendations: 'Recommendations',
  ask: 'Questions asked',
  meetings: 'Meeting notes',
  reports: 'Weekly reports',
  patterns: 'Patterns across clients',
  embeddings: 'Find by meaning (Voyage AI)',
  tickets: 'Reading tickets',
  people: 'Profiling people',
  themes: 'Recurring issues',
};

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
