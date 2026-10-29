import type { ReactNode } from 'react';

/**
 * A titled part of the settings page. SettingsNav links to its `id`, and
 * focuses it after jumping there so Tab carries on from it.
 */
export function SettingsSection({
  id,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  /** Quiet text or a link on the right of the title. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      tabIndex={-1}
      // Below 1280px the nav bar stays over the top of the page.
      className="flex scroll-mt-20 flex-col gap-5 outline-none xl:scroll-mt-12"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="max-w-xl">
          <h2 id={headingId} className="text-section font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-meta text-muted">{description}</p>
        </div>
        {aside && <div className="text-meta text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
