'use client';

import { RECIPIENTS_MAX, type Recipient } from '@dossierhq/contracts';
import { Plus, X } from 'lucide-react';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { saveRecipients } from '@/app/report-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const fieldClass =
  'h-9 min-w-0 rounded-input bg-surface px-3 text-body text-ink placeholder:text-muted';

type Row = Recipient & { key: number };

/**
 * Who a client's weekly report goes to: addressed, or copied in. Owners and
 * admins change the list; everyone else sees it.
 */
export function RecipientsEditor({
  clientId,
  clientName,
  recipients,
  canManage,
  suggestion,
}: {
  clientId: string;
  clientName: string;
  recipients: Recipient[];
  canManage: boolean;
  /** A name to start from when there's no one yet, e.g. the primary contact. */
  suggestion?: string;
}) {
  const headingId = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    recipients.map((recipient, key) => ({ ...recipient, key })),
  );
  const [nextKey, setNextKey] = useState(recipients.length);
  const [message, setMessage] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed =
    JSON.stringify(
      rows.map(({ name, email, copy }) => ({ name, email, copy })),
    ) !== JSON.stringify(recipients);

  function update(key: number, change: Partial<Recipient>) {
    setMessage(null);
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  }

  function add() {
    setMessage(null);
    setRows((current) => [
      ...current,
      {
        key: nextKey,
        name: current.length === 0 ? (suggestion ?? '') : '',
        email: '',
        copy: current.some((row) => !row.copy),
      },
    ]);
    setNextKey((key) => key + 1);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveRecipients(
        clientId,
        rows.map(({ name, email, copy }) => ({ name, email, copy })),
      );
      setMessage(
        result.ok
          ? { text: 'Saved.', failed: false }
          : { text: result.error, failed: true },
      );
    });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-card bg-sheet p-5 shadow-card"
    >
      <h2 id={headingId} className="text-body font-medium text-ink">
        Who gets the report
      </h2>
      <p className="mt-0.5 text-meta text-muted">
        {rows.length === 0
          ? `No one yet, so ${clientName}’s reports can be approved but not sent.`
          : 'Each approved report goes to these people, in one email.'}
      </p>

      {!canManage ? (
        rows.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-body text-ink">
            {rows.map((row) => (
              <li key={row.key}>
                {row.name ? `${row.name} · ` : ''}
                <span className="text-text">{row.email}</span>
                {row.copy && <span className="text-muted"> (copied in)</span>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <form onSubmit={save} className="mt-4 flex flex-col gap-3">
          {rows.length > 0 && (
            <ul className="flex flex-col gap-2">
              {rows.map((row, index) => (
                <li
                  key={row.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto_auto]"
                >
                  <input
                    aria-label={`Name ${index + 1}`}
                    value={row.name}
                    maxLength={100}
                    placeholder="Name"
                    onChange={(event) =>
                      update(row.key, { name: event.target.value })
                    }
                    className={cn(fieldClass, 'max-sm:col-span-2')}
                  />
                  <input
                    aria-label={`Email ${index + 1}`}
                    type="email"
                    required
                    spellCheck={false}
                    value={row.email}
                    placeholder="name@client.com"
                    onChange={(event) =>
                      update(row.key, { email: event.target.value })
                    }
                    className={fieldClass}
                  />
                  <label className="flex items-center gap-1.5 text-meta text-text max-sm:order-last">
                    <input
                      type="checkbox"
                      checked={row.copy}
                      onChange={(event) =>
                        update(row.key, { copy: event.target.checked })
                      }
                      className="size-4 accent-brand"
                    />
                    Copy in
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove ${row.email || `person ${index + 1}`}`}
                    onClick={() => {
                      setMessage(null);
                      setRows((current) =>
                        current.filter((r) => r.key !== row.key),
                      );
                    }}
                    className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              disabled={rows.length >= RECIPIENTS_MAX}
              onClick={add}
            >
              <Plus aria-hidden />
              Add someone
            </Button>
            <div className="flex items-center gap-3">
              {message && (
                <p
                  role={message.failed ? 'alert' : 'status'}
                  className={cn(
                    'text-meta',
                    message.failed ? 'text-alert' : 'text-muted',
                  )}
                >
                  {message.text}
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                disabled={pending || !changed}
              >
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
