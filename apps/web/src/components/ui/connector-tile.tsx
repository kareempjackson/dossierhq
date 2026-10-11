import type { Tool } from '@dossierhq/contracts';
import { cn } from '@/lib/cn';

const letters: Record<Tool, string> = {
  ninjaone: 'N',
  hudu: 'H',
  sharepoint: 'S',
  fathom: 'F',
};

const sizes = {
  sm: 'size-7 rounded-row text-meta',
  md: 'size-9 rounded-input text-body',
  lg: 'size-11 rounded-tile text-section',
} as const;

/**
 * A lettered stand-in for a tool's logo. Decorative: always place the tool's
 * name next to it.
 */
export function ConnectorTile({
  tool,
  size = 'md',
  className,
}: {
  tool: Tool;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center bg-surface font-semibold text-ink shadow-card',
        sizes[size],
        className,
      )}
    >
      {letters[tool]}
    </span>
  );
}
