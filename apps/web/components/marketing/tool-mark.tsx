import { cn } from '@/lib/cn';

export type ToolName =
  'NinjaOne' | 'Hudu' | 'SharePoint' | 'Fathom' | 'Microsoft 365';

/**
 * A tool's name set as a quiet wordmark. Stands in for the tools' own logos
 * until they're licensed and added; swap the inside of this component for an
 * <Image> per tool when they are.
 */
export function ToolMark({
  name,
  className,
}: {
  name: ToolName;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-display tracking-[-0.03em] whitespace-nowrap',
        className,
      )}
    >
      {name}
    </span>
  );
}

/** A tool in a small white tile, as in the product illustrations. */
export function ToolTile({
  name,
  className,
}: {
  name: ToolName;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid h-12 min-w-0 place-items-center overflow-hidden rounded-xl bg-white text-small text-ink shadow-[0_1px_2px_rgb(19_35_42/0.06)]',
        className,
      )}
    >
      <ToolMark name={name} />
    </span>
  );
}
