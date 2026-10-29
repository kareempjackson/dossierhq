import type { Tool } from '@dossierhq/contracts';
import { cn } from '@/lib/cn';

const letters: Record<Tool, string> = {
  ninjaone: 'N',
  hudu: 'H',
  sharepoint: 'S',
  fathom: 'F',
};

const tones = {
  light: 'bg-surface text-ink shadow-card',
  /** On the landing page's dark bands. */
  dark: 'bg-white/10 text-white ring-1 ring-white/15',
} as const;

const sizes = {
  sm: 'size-7 rounded-row text-meta',
  md: 'size-9 rounded-input text-body',
  lg: 'size-11 rounded-tile text-section',
} as const;

/**
 * A lettered stand-in for a tool's logo; null for what Dossier holds itself,
 * such as meeting notes. Decorative: always place the name next to it.
 */
export function ConnectorTile({
  tool,
  size = 'md',
  tone = 'light',
  className,
}: {
  tool: Tool | null;
  size?: keyof typeof sizes;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center font-semibold',
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {tool ? letters[tool] : 'D'}
    </span>
  );
}
