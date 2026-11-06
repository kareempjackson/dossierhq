import { Tag } from '@/components/ui/tag';
import type { ToolStatus } from '@/lib/connector-status';

/** Connected, syncing, failing, or not connected, as a word in a tag. */
export function StateTag({
  tool,
}: {
  tool: Pick<ToolStatus, 'state' | 'syncing'>;
}) {
  if (tool.state === 'off') return <Tag tone="neutral">Not connected</Tag>;
  if (tool.syncing) return <Tag tone="drafted">Syncing</Tag>;
  if (tool.state === 'reconnect') return <Tag tone="attention">Failing</Tag>;
  return <Tag tone="healthy">Connected</Tag>;
}
