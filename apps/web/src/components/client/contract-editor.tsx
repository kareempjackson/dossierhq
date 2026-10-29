'use client';

import type { Contract } from '@dossierhq/contracts';
import { X } from 'lucide-react';
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  removeContract,
  saveContract,
  type ContractState,
} from '@/app/contract-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const fieldClass =
  'h-10 rounded-input bg-surface px-3 text-body font-normal text-ink placeholder:text-muted aria-invalid:outline-2 aria-invalid:outline-alert';
const labelClass = 'flex flex-col gap-1.5 text-meta font-medium text-ink';

/** Common currencies first; any three-letter code works. */
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'ZAR', 'INR'];

/**
 * Adds or changes a client's contract terms, in a modal dialog. No tool
 * records them, so they're typed in here, and syncs leave them alone.
 */
export function ContractEditor({
  clientId,
  clientName,
  contract,
  currency,
}: {
  clientId: string;
  clientName: string;
  contract: Contract | null;
  /** The currency to start from without a contract, e.g. other clients'. */
  currency: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const id = useId();
  const [state, action, pending] = useActionState<ContractState, FormData>(
    saveContract.bind(null, clientId),
    {},
  );
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();
  const value = (field: string, fallback: string) =>
    state.values?.[field] ?? fallback;
  const invalid = (field: string) =>
    state.field === field
      ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` }
      : {};

  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  function remove() {
    setRemoveError(null);
    startRemove(async () => {
      const result = await removeContract(clientId);
      if (!result.ok) {
        setRemoveError(result.error);
        return;
      }
      setRemoving(false);
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-row underline-offset-2 hover:text-ink hover:underline"
      >
        {contract ? 'Edit' : 'Add'}
      </button>
      <span role="status" className="sr-only">
        {state.ok ? 'Contract saved' : ''}
      </span>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setRemoving(false)}
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-card bg-sheet p-0 text-text shadow-float backdrop:bg-ink/30"
      >
        <form action={action} className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-section font-semibold">
                {clientName}’s contract
              </h2>
              <p className="mt-1 text-meta text-muted">
                None of the connected tools records contracts, so they’re kept
                here. Claude reads these terms when it drafts recommendations.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>

          <label className={labelClass}>
            Plan
            <input
              name="plan"
              required
              maxLength={100}
              placeholder="Managed Plus"
              defaultValue={value('plan', contract?.plan ?? '')}
              {...invalid('plan')}
              className={fieldClass}
            />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4">
            <label className={labelClass}>
              Monthly fee
              <input
                name="monthlyFee"
                required
                inputMode="decimal"
                placeholder="1450.00"
                defaultValue={value(
                  'monthlyFee',
                  contract ? String(contract.monthlyFee) : '',
                )}
                {...invalid('monthlyFee')}
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Currency
              <input
                name="currency"
                required
                maxLength={3}
                list={`${id}-currencies`}
                spellCheck={false}
                defaultValue={value('currency', contract?.currency ?? currency)}
                {...invalid('currency')}
                className={cn(fieldClass, 'uppercase')}
              />
              <datalist id={`${id}-currencies`}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Started
              <input
                type="date"
                name="startedOn"
                required
                defaultValue={value('startedOn', contract?.startedOn ?? '')}
                {...invalid('startedOn')}
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Renews
              <input
                type="date"
                name="renewsOn"
                required
                defaultValue={value('renewsOn', contract?.renewsOn ?? '')}
                {...invalid('renewsOn')}
                className={fieldClass}
              />
            </label>
          </div>
          <label className={labelClass}>
            <span>
              What it includes{' '}
              <span className="font-normal text-muted">(one per line)</span>
            </span>
            <textarea
              name="includes"
              rows={5}
              placeholder={
                'Helpdesk, 8am to 6pm\nPatching and monitoring\nBackups'
              }
              defaultValue={value(
                'includes',
                contract?.includes.join('\n') ?? '',
              )}
              {...invalid('includes')}
              className={cn(fieldClass, 'h-auto resize-y py-2')}
            />
          </label>

          {(state.error || removeError) && (
            <p id={`${id}-error`} role="alert" className="text-meta text-alert">
              {state.error ?? removeError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {contract ? (
              removing ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-meta text-text">Its files stay.</span>
                  <Button disabled={removePending} onClick={remove}>
                    {removePending ? 'Removing…' : 'Remove the terms'}
                  </Button>
                  <Button variant="ghost" onClick={() => setRemoving(false)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" onClick={() => setRemoving(true)}>
                  Remove terms
                </Button>
              )
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => dialogRef.current?.close()}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </span>
          </div>
        </form>
      </dialog>
    </>
  );
}
