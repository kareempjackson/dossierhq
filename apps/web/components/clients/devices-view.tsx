'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Mark } from '@/components/brand/logo';
import { ButtonAnchor } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { userHref } from '@/lib/client-paths';
import type { DeviceRow as Device } from '@/lib/client-views';
import { cn } from '@/lib/cn';

const FILTERS = [
  { value: 'all', label: 'All', test: () => true },
  {
    value: 'attention',
    label: 'Needs attention',
    test: (device: Device) => device.needsAttention,
  },
  {
    value: 'offline',
    label: 'Offline',
    test: (device: Device) => !device.online,
  },
] as const;

/**
 * A client's devices, filtered by what needs attention or what's offline.
 * Choosing a device opens its detail panel over the right of the sheet;
 * Esc or × closes it and returns focus to the row.
 */
export function DevicesView({
  clientId,
  devices,
}: {
  clientId: string;
  devices: Device[];
}) {
  const [filter, setFilter] =
    useState<(typeof FILTERS)[number]['value']>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const test = FILTERS.find((option) => option.value === filter)!.test;
  const shown = devices.filter(test);
  const selected = devices.find((device) => device.id === selectedId);

  const close = () => {
    setSelectedId(null);
    opener.current?.focus();
  };

  return (
    <>
      <div
        role="group"
        aria-label="Which devices"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              'rounded-full px-3 py-1 text-small transition-colors',
              filter === option.value
                ? 'bg-white text-ink ring-1 ring-grey-3'
                : 'bg-grey-2 text-muted hover:text-ink',
            )}
          >
            {option.label} {devices.filter(option.test).length}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[38rem] border-separate border-spacing-y-1 text-left text-small">
            <thead>
              <tr className="text-[0.6875rem] text-muted">
                {['Device', 'User', 'OS', 'Patching', 'Last seen'].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 pb-2 font-normal"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((device) => {
                const isSelected = device.id === selectedId;
                return (
                  <tr
                    key={device.id}
                    className={cn(
                      'relative [&>td]:transition-colors',
                      isSelected
                        ? '[&>td]:bg-grey-2'
                        : 'odd:[&>td]:bg-grey-1 hover:[&>td]:bg-grey-2',
                    )}
                  >
                    <td className="rounded-l-xl px-4 py-3.5">
                      <button
                        type="button"
                        aria-expanded={isSelected}
                        aria-controls="device-panel"
                        onClick={(event) => {
                          opener.current = event.currentTarget;
                          setSelectedId(isSelected ? null : device.id);
                        }}
                        className="rounded-sm font-semibold after:absolute after:inset-0"
                      >
                        {device.name}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-muted">
                      {device.user && device.userId ? (
                        // Above the row's own button, which covers the row.
                        <Link
                          href={userHref(clientId, device.userId)}
                          className="relative z-10 rounded-sm underline decoration-ink/20 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink"
                        >
                          {device.user}
                        </Link>
                      ) : (
                        (device.user ?? '—')
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-muted">{device.os}</td>
                    <td className="px-4 py-3.5">
                      <Tag tone={device.patching.tone}>
                        {device.patching.label}
                      </Tag>
                    </td>
                    <td className="rounded-r-xl px-4 py-3.5 text-muted">
                      {device.lastSeen}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-grey-1 px-4 py-8 text-center text-small text-muted">
          {devices.length === 0
            ? 'No devices yet. Connect NinjaOne to bring in this client’s devices.'
            : filter === 'offline'
              ? 'Every device checked in recently.'
              : 'Nothing needs attention.'}
        </p>
      )}

      {selected && (
        <DevicePanel
          key={selected.id}
          clientId={clientId}
          device={selected}
          onClose={close}
        />
      )}
    </>
  );
}

/** One device's facts and what Dossier suggests, over the right of the sheet. */
function DevicePanel({
  clientId,
  device,
  onClose,
}: {
  clientId: string;
  device: Device;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section
      id="device-panel"
      aria-labelledby="device-panel-title"
      className="absolute inset-y-0 right-0 z-10 flex w-full flex-col overflow-y-auto rounded-2xl bg-white p-5 shadow-float sm:w-[19rem]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.75rem] text-muted">Device</p>
          <h2
            ref={heading}
            id="device-panel-title"
            tabIndex={-1}
            className="mt-0.5 text-h2 outline-none"
          >
            {device.name}
          </h2>
          <p className="mt-1 text-small text-muted">
            {device.user && device.userId ? (
              <>
                <Link
                  href={userHref(clientId, device.userId)}
                  className="rounded-sm underline decoration-ink/20 underline-offset-[3px] transition-colors hover:text-ink hover:decoration-ink"
                >
                  {device.user}
                </Link>
                {' · '}
              </>
            ) : (
              device.user && `${device.user} · `
            )}
            {device.os}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${device.name}`}
          className="-mt-1 -mr-1 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-grey-1 hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <dl className="mt-5 flex flex-col gap-1.5">
        {device.facts.map((fact) => (
          <div
            key={fact.label}
            className="flex items-center justify-between gap-4 rounded-lg bg-grey-1 px-3 py-2.5 text-small"
          >
            <dt className="text-muted">{fact.label}</dt>
            <dd className="font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {device.attention.length > 0 && (
        <div className="mt-6">
          <p className="text-[0.75rem] text-muted">Needs attention</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {device.attention.map((title) => (
              <li
                key={title}
                className="rounded-lg bg-attention-soft px-3 py-2.5 text-small text-attention"
              >
                {title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {device.suggestion && (
        <div className="mt-6 rounded-xl bg-lilac-soft p-3.5">
          <p className="flex items-center gap-2 text-[0.75rem] text-lilac-ink">
            <Mark height={11} />
            Dossier suggests
          </p>
          <p className="mt-1.5 text-small">{device.suggestion}</p>
        </div>
      )}

      {device.remoteUrl && (
        <div className="mt-auto pt-6">
          <ButtonAnchor
            href={device.remoteUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
            className="w-full"
          >
            Open in NinjaOne
          </ButtonAnchor>
        </div>
      )}
    </section>
  );
}
