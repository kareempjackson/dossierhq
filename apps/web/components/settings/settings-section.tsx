import type { ReactNode } from 'react';

/** One part of Settings: a grey card, with a small label over its heading. */
export function SettingsSection({
  id,
  label,
  title,
  intro,
  children,
}: {
  id: string;
  label?: string;
  title?: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={title ? `${id}-title` : undefined}
      className="scroll-mt-6 rounded-3xl bg-grey-1 p-5 sm:p-6"
    >
      {label && <p className="text-[0.75rem] text-muted">{label}</p>}
      {title && (
        <h2 id={`${id}-title`} className="mt-1 text-h2">
          {title}
        </h2>
      )}
      {intro && <p className="mt-2 max-w-2xl text-small text-muted">{intro}</p>}
      <div className={title || intro ? 'mt-5' : undefined}>{children}</div>
    </section>
  );
}
