import { Check, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type Message = { text: string; failed: boolean };

/**
 * One setting in a ListCard: what it is, where it stands, and what to do
 * about it. `children` opens below for steps that need room, such as a form.
 */
export function SettingRow({
  icon: Icon,
  title,
  badge,
  description,
  action,
  feedback,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** A Pill beside the title, e.g. "On". */
  badge?: ReactNode;
  description: ReactNode;
  /** Buttons on the right. */
  action?: ReactNode;
  /** What the last action did: a Feedback. */
  feedback?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-tile bg-surface text-ink"
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 basis-60">
            <h3 className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
              {title}
              {badge}
            </h3>
            <div className="mt-0.5 text-meta text-muted">{description}</div>
            {feedback}
          </div>
          {action && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {action}
            </div>
          )}
        </div>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </li>
  );
}

/** What an action did: a quiet tick when it worked, the reason when not. */
export function Feedback({ message }: { message: Message | null }) {
  if (!message) return null;
  if (message.failed) {
    return (
      <p role="alert" className="mt-2 text-meta text-alert">
        {message.text}
      </p>
    );
  }
  return (
    <p
      role="status"
      className="mt-2 flex items-center gap-1.5 text-meta text-ink"
    >
      <Check
        aria-hidden
        className="size-3.5 shrink-0 text-brand"
        strokeWidth={2.25}
      />
      {message.text}
    </p>
  );
}
