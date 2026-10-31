'use client';

import {
  modelsOf,
  PROVIDERS,
  type IntelligenceKey,
  type ProviderId,
  type ProviderInfo,
} from '@dossierhq/contracts';
import { ExternalLink, KeyRound } from 'lucide-react';
import { useId, useState, useTransition, type FormEvent } from 'react';
import {
  removeIntelligenceKey,
  setIntelligenceKey,
} from '@/app/intelligence-actions';
import {
  Feedback,
  SettingRow,
  type Message,
} from '@/components/settings/setting-row';
import { Button } from '@/components/ui/button';
import { ListCard } from '@/components/ui/list-card';
import { Pill } from '@/components/ui/pill';
import { formatDate, formatList } from '@/lib/format';

/**
 * The workspace's own API keys, one row a provider. A key is checked with its
 * provider before Dossier keeps it, and only its last four characters ever
 * come back. Only owners and admins can add, replace or remove one.
 */
export function ApiKeys({
  keys,
  dossierKeys,
  canStoreKeys,
  canManage,
  timeZone,
}: {
  keys: IntelligenceKey[];
  /** Providers whose models run on Dossier's own key meanwhile. */
  dossierKeys: ProviderId[];
  canStoreKeys: boolean;
  canManage: boolean;
  timeZone: string;
}) {
  return (
    <>
      {!canStoreKeys && (
        <p
          role="status"
          className="rounded-card bg-marker-highlight px-4 py-3 text-body text-ink"
        >
          This Dossier can’t keep API keys safe yet. Set CONNECTOR_SECRET_KEY on
          the API and restart it to add one.
        </p>
      )}
      <ListCard>
        {PROVIDERS.map((provider) => (
          <KeyRow
            key={provider.id}
            provider={provider}
            saved={keys.find((key) => key.provider === provider.id) ?? null}
            onDossiers={dossierKeys.includes(provider.id)}
            canEdit={canManage && canStoreKeys}
            timeZone={timeZone}
          />
        ))}
      </ListCard>
      {!canManage && (
        <p className="text-meta text-muted">
          Only owners and admins can add or remove keys.
        </p>
      )}
    </>
  );
}

function KeyRow({
  provider,
  saved,
  onDossiers,
  canEdit,
  timeZone,
}: {
  provider: ProviderInfo;
  saved: IntelligenceKey | null;
  onDossiers: boolean;
  canEdit: boolean;
  timeZone: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [removing, startRemoving] = useTransition();
  const models = formatList(modelsOf(provider.id).map((model) => model.name));

  function remove() {
    setMessage(null);
    startRemoving(async () => {
      const result = await removeIntelligenceKey(provider.id);
      setConfirming(false);
      setMessage(
        result.ok
          ? { text: `Removed your ${provider.name} key.`, failed: false }
          : { text: result.error, failed: true },
      );
    });
  }

  const badge = saved ? (
    <Pill tone="positive" dot>
      Your key
    </Pill>
  ) : onDossiers ? (
    <Pill tone="quiet">Dossier’s key</Pill>
  ) : null;

  const description = saved ? (
    <>
      Ends in <span className="font-mono text-mono text-ink">{saved.hint}</span>
      . Added by {saved.addedBy} on {formatDate(saved.addedAt, timeZone)}.{' '}
      {provider.name} bills your account for what Dossier drafts with{' '}
      {provider.product}.
    </>
  ) : onDossiers ? (
    <>
      {models} run on Dossier’s key. Add your own to have {provider.name} bill
      you directly.
    </>
  ) : (
    <>
      Add a key to draft with {models}.{' '}
      <a
        href={provider.keysUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink"
      >
        Get a key from {provider.name}
        <ExternalLink aria-hidden className="size-3" strokeWidth={2} />
      </a>
    </>
  );

  const action = !canEdit ? null : confirming ? (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={removing}
        onClick={() => setConfirming(false)}
      >
        Keep it
      </Button>
      <Button size="sm" disabled={removing} onClick={remove}>
        {removing ? 'Removing…' : 'Remove key'}
      </Button>
    </>
  ) : editing ? null : saved ? (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setMessage(null);
          setConfirming(true);
        }}
      >
        Remove
      </Button>
      <Button
        size="sm"
        onClick={() => {
          setMessage(null);
          setEditing(true);
        }}
      >
        Replace
      </Button>
    </>
  ) : (
    <Button
      size="sm"
      onClick={() => {
        setMessage(null);
        setEditing(true);
      }}
    >
      Add key
    </Button>
  );

  return (
    <SettingRow
      icon={KeyRound}
      title={`${provider.name} · ${provider.product}`}
      badge={badge}
      description={
        confirming ? (
          <>
            Remove your {provider.name} key?{' '}
            {onDossiers
              ? `${provider.product} goes back to Dossier’s key.`
              : `Nothing drafts with ${provider.product} until you add another.`}
          </>
        ) : (
          description
        )
      }
      action={action}
      feedback={<Feedback message={message} />}
    >
      {editing && (
        <KeyForm
          provider={provider}
          replacing={saved !== null}
          onDone={(text) => {
            setEditing(false);
            if (text) setMessage({ text, failed: false });
          }}
        />
      )}
    </SettingRow>
  );
}

function KeyForm({
  provider,
  replacing,
  onDone,
}: {
  provider: ProviderInfo;
  replacing: boolean;
  /** With what to say, once the key is kept; with null when cancelled. */
  onDone: (text: string | null) => void;
}) {
  const id = useId();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startSaving(async () => {
      const result = await setIntelligenceKey(provider.id, key);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setKey('');
      onDone(
        `${provider.name} accepted the key. Dossier keeps it encrypted, and shows only its last four characters.`,
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={id} className="text-meta font-medium text-ink">
        {replacing
          ? `New ${provider.name} API key`
          : `${provider.name} API key`}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="password"
          required
          autoFocus
          spellCheck={false}
          autoComplete="off"
          // Password managers shouldn't offer to keep it as a sign-in.
          data-1p-ignore
          data-lpignore="true"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={provider.keyPlaceholder}
          aria-describedby={`${id}-about`}
          className="h-9 min-w-0 flex-1 basis-64 rounded-full bg-surface px-4 font-mono text-mono text-ink placeholder:text-muted"
        />
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={() => onDone(null)}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !key}>
          {saving ? `Checking with ${provider.name}…` : 'Check and save'}
        </Button>
      </div>
      <p id={`${id}-about`} className="text-meta-sm text-muted">
        Dossier checks it with {provider.name} first, without spending anything.
      </p>
      <Feedback message={error ? { text: error, failed: true } : null} />
    </form>
  );
}
