'use client';

import { FileText, Paperclip, Trash2 } from 'lucide-react';
import {
  useActionState,
  useId,
  useOptimistic,
  useState,
  useTransition,
} from 'react';
import {
  addContractFile,
  removeContract,
  removeContractFile,
  saveContract,
  type ContractFileState,
  type ContractFormState,
} from '@/app/(workspace)/clients/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BusyIcon } from '@/components/ui/spinner';
import { Tag } from '@/components/ui/tag';
import type { ContractView as Terms, DocumentRow } from '@/lib/contract-views';

/** The API's limit, checked here too so a big file isn't sent at all. */
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT =
  'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/png,image/jpeg';

/**
 * A client's contract: its terms, typed in because no tool records them, and
 * the files kept with it. Owners and admins change both; everyone reads.
 */
export function ContractView({
  clientId,
  clientName,
  contract,
  files,
  canChange,
}: {
  clientId: string;
  clientName: string;
  contract: Terms | null;
  files: DocumentRow[];
  canChange: boolean;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <TermsSection
        clientId={clientId}
        clientName={clientName}
        contract={contract}
        canChange={canChange}
      />
      <FilesSection clientId={clientId} files={files} canChange={canChange} />
    </div>
  );
}

function TermsSection({
  clientId,
  clientName,
  contract,
  canChange,
}: {
  clientId: string;
  clientName: string;
  contract: Terms | null;
  canChange: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ error?: string; text?: string }>({});
  const [removing, startRemoving] = useTransition();
  const id = useId();

  const remove = () =>
    startRemoving(async () => {
      const result = await removeContract(clientId);
      setConfirming(false);
      setNote(
        result.ok
          ? { text: 'Removed the contract’s terms. Its files are still here.' }
          : { error: result.error },
      );
    });

  return (
    <section aria-labelledby={`${id}-terms`} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-terms`} className="text-h3">
          Terms
        </h2>
        {canChange && contract && !editing && !confirming && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConfirming(true);
                setNote({});
              }}
            >
              Remove
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(true);
                setNote({});
              }}
            >
              Change terms
            </Button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-grey-1 px-3 py-2.5">
          <p className="text-small">
            Remove the contract’s terms? {clientName} drops off Renewals; the
            files stay.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={removing}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              variant="ink"
              size="sm"
              disabled={removing}
              onClick={remove}
            >
              <BusyIcon icon={Trash2} busy={removing} />
              Remove terms
            </Button>
          </div>
        </div>
      )}

      {editing ? (
        <TermsForm
          clientId={clientId}
          contract={contract}
          onDone={(saved) => {
            setEditing(false);
            if (saved) setNote({ text: 'Saved the contract’s terms.' });
          }}
        />
      ) : contract ? (
        <TermsCard contract={contract} />
      ) : (
        <div className="mt-4 rounded-xl bg-grey-1 px-4 py-8 text-center">
          <p className="text-small text-muted">
            No contract on file. No tool records one, so its terms are typed
            in here.
          </p>
          {canChange ? (
            <Button
              variant="ink"
              size="sm"
              className="mt-4"
              onClick={() => {
                setEditing(true);
                setNote({});
              }}
            >
              Add the contract
            </Button>
          ) : (
            <p className="mt-2 text-[0.75rem] text-muted">
              Owners and admins add contracts.
            </p>
          )}
        </div>
      )}

      {(note.error || note.text) && (
        <p
          role={note.error ? 'alert' : 'status'}
          className={`mt-3 text-[0.75rem] ${note.error ? 'text-attention' : 'text-healthy'}`}
        >
          {note.error ?? note.text}
        </p>
      )}
    </section>
  );
}

function TermsCard({ contract }: { contract: Terms }) {
  return (
    <div className="mt-4">
      <p className="font-display text-h3">{contract.plan}</p>
      <dl className="mt-4 grid gap-x-6 gap-y-4 text-small sm:grid-cols-3">
        <div>
          <dt className="text-[0.75rem] text-muted">Fee</dt>
          <dd className="mt-0.5 font-medium">{contract.fee}</dd>
        </div>
        <div>
          <dt className="text-[0.75rem] text-muted">Started</dt>
          <dd className="mt-0.5 font-medium">{contract.started}</dd>
        </div>
        <div>
          <dt className="text-[0.75rem] text-muted">Renews</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2 font-medium">
            {contract.renews}
            <Tag tone={contract.soon ? 'attention' : 'neutral'}>
              {contract.renewsIn}
            </Tag>
          </dd>
        </div>
      </dl>
      <h3 className="mt-6 font-sans text-[0.75rem] font-normal tracking-normal text-muted">
        Includes
      </h3>
      {contract.includes.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {contract.includes.map((item, index) => (
            <li
              key={`${index}-${item}`}
              className="rounded-xl bg-grey-1 px-3 py-2.5 text-small"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-small text-muted">Nothing listed.</p>
      )}
    </div>
  );
}

/**
 * The terms as a form. Submitted by hand rather than as a form action, so a
 * no from the API leaves what was typed in place (React clears a form after
 * its action).
 */
function TermsForm({
  clientId,
  contract,
  onDone,
}: {
  clientId: string;
  contract: Terms | null;
  onDone: (saved: boolean) => void;
}) {
  const [state, setState] = useState<ContractFormState>({});
  const [saving, startSaving] = useTransition();
  const id = useId();

  const submit = (formData: FormData) =>
    startSaving(async () => {
      const result = await saveContract({}, formData);
      // Saved: the page has read the contract again; close the form.
      if (result.saved) onDone(true);
      else setState(result);
    });

  const start = contract?.form;
  const field = (name: NonNullable<ContractFormState['field']>) => ({
    id: `${id}-${name}`,
    name,
    'aria-invalid': state.field === name ? true : undefined,
    'aria-describedby': state.field === name ? `${id}-error` : undefined,
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
      className="mt-4 flex flex-col gap-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-plan`} className="text-small font-medium">
          Plan
        </label>
        <Input
          {...field('plan')}
          defaultValue={start?.plan}
          placeholder="Managed IT, Gold"
          maxLength={100}
          autoFocus
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${id}-monthlyFee`}
            className="text-small font-medium"
          >
            Monthly fee
          </label>
          <Input
            {...field('monthlyFee')}
            defaultValue={start?.monthlyFee}
            inputMode="decimal"
            placeholder="1250.00"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-currency`} className="text-small font-medium">
            Currency
          </label>
          <Input
            {...field('currency')}
            defaultValue={start?.currency}
            placeholder="USD"
            maxLength={3}
            autoCapitalize="characters"
            className="uppercase"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${id}-startedOn`}
            className="text-small font-medium"
          >
            Started
          </label>
          <Input
            {...field('startedOn')}
            type="date"
            defaultValue={start?.startedOn}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-renewsOn`} className="text-small font-medium">
            Renews
          </label>
          <Input
            {...field('renewsOn')}
            type="date"
            defaultValue={start?.renewsOn}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-includes`} className="text-small font-medium">
          What it includes{' '}
          <span className="font-normal text-muted">(one per line)</span>
        </label>
        <textarea
          {...field('includes')}
          defaultValue={start?.includes}
          rows={5}
          placeholder={'24/7 monitoring\nHelpdesk, 8am–6pm\nQuarterly review'}
          className="w-full resize-y rounded-xl bg-grey-1 p-4 text-body outline-none placeholder:text-muted aria-invalid:bg-attention-soft focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-lilac-deep focus-visible:ring-inset"
        />
      </div>
      {state.error && (
        <p id={`${id}-error`} role="alert" className="text-small text-attention">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="ink" disabled={saving}>
          {saving ? 'Saving…' : 'Save terms'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => onDone(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function FilesSection({
  clientId,
  files,
  canChange,
}: {
  clientId: string;
  files: DocumentRow[];
  canChange: boolean;
}) {
  const [shown, removed] = useOptimistic(files, (current, gone: string) =>
    current.filter((file) => file.id !== gone),
  );
  const [state, action, adding] = useActionState<ContractFileState, FormData>(
    addContractFile,
    {},
  );
  const [seen, setSeen] = useState(state);
  const [note, setNote] = useState<{ error?: string; text?: string }>({});
  const [asking, setAsking] = useState<string | null>(null);
  const [, startRemoving] = useTransition();
  const id = useId();

  // A file just added, or why not. React clears the picker after the action.
  if (state !== seen) {
    setSeen(state);
    setNote(
      state.added
        ? { text: `Added “${state.added}”.` }
        : state.error
          ? { error: state.error }
          : {},
    );
  }

  const remove = (file: DocumentRow) =>
    startRemoving(async () => {
      setAsking(null);
      removed(file.id);
      setNote({});
      const result = await removeContractFile(clientId, file.id);
      setNote(
        result.ok
          ? { text: `Removed “${file.name}”.` }
          : { error: result.error },
      );
    });

  return (
    <aside
      aria-labelledby={`${id}-files`}
      className="self-start rounded-2xl bg-grey-1 p-4"
    >
      <h2
        id={`${id}-files`}
        className="font-sans text-[0.75rem] font-normal tracking-normal text-muted"
      >
        Contract files
      </h2>
      {shown.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {shown.map((file) => (
            <li key={file.id} className="rounded-xl bg-white px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <a
                  href={file.href}
                  target="_blank"
                  rel="noopener"
                  className="flex min-w-0 items-start gap-2 rounded-sm"
                >
                  <FileText
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted"
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0">
                    <span className="block text-small font-medium wrap-anywhere underline-offset-[3px] hover:underline">
                      {file.name}
                    </span>
                    <span className="block text-[0.75rem] text-muted">
                      {file.about}
                    </span>
                    <span className="block text-[0.75rem] text-muted">
                      {file.added}
                    </span>
                  </span>
                </a>
                {canChange && asking !== file.id && (
                  <button
                    type="button"
                    onClick={() => setAsking(file.id)}
                    aria-label={`Remove ${file.name}`}
                    className="rounded-sm text-[0.75rem] text-muted transition-colors hover:text-ink"
                  >
                    Remove
                  </button>
                )}
              </div>
              {asking === file.id && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="mr-auto text-[0.75rem]">Remove it?</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAsking(null)}
                  >
                    Keep
                  </Button>
                  <Button variant="ink" size="sm" onClick={() => remove(file)}>
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded-xl bg-white px-3 py-2.5 text-small text-muted">
          No files yet.
        </p>
      )}

      {canChange ? (
        <form action={action} className="mt-4">
          <input type="hidden" name="clientId" value={clientId} />
          <label htmlFor={`${id}-file`} className="text-small font-medium">
            Add a file
          </label>
          <p className="text-[0.75rem] text-muted">
            The signed contract, a schedule, a quote: PDF, Word, PNG or JPEG,
            up to 10 MB.
          </p>
          <input
            id={`${id}-file`}
            name="file"
            type="file"
            accept={ACCEPT}
            required
            disabled={adding}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && file.size > MAX_BYTES) {
                event.target.value = '';
                setNote({ error: 'Keep each file under 10 MB.' });
              } else {
                setNote({});
              }
            }}
            className="mt-2 block w-full text-[0.75rem] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-small file:text-ink hover:file:bg-grey-2"
          />
          <Button
            type="submit"
            variant="ink"
            size="sm"
            disabled={adding}
            className="mt-3 w-full"
          >
            <BusyIcon icon={Paperclip} busy={adding} />
            {adding ? 'Adding…' : 'Add file'}
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-[0.75rem] text-muted">
          Owners and admins add contract files.
        </p>
      )}
      {(note.error || note.text) && (
        <p
          role={note.error ? 'alert' : 'status'}
          className={`mt-3 text-[0.75rem] ${note.error ? 'text-attention' : 'text-healthy'}`}
        >
          {note.error ?? note.text}
        </p>
      )}
    </aside>
  );
}
