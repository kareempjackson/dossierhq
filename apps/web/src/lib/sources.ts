import { TOOL_NAMES, type Source } from '@dossierhq/contracts';
import { formatDate, formatTimestamp } from './format';

/**
 * The mono line under a cited statement.
 * Records: "NinjaOne · ALERT-48213 · 9 Oct 2026, 02:14"
 * Meetings: "Fathom · 30 Sept 2026 · 00:14:32 · Priya Nair, client"
 */
export function sourceLineText(source: Source, timeZone: string): string {
  const tool = TOOL_NAMES[source.tool];
  if (source.kind === 'meeting') {
    return [
      tool,
      formatDate(source.recordedAt, timeZone),
      source.transcriptAt,
      `${source.speakerName}, ${source.speakerRole === 'client' ? 'client' : 'MSP'}`,
    ].join(' · ');
  }
  return [
    tool,
    source.recordId,
    formatTimestamp(source.recordedAt, timeZone),
  ].join(' · ');
}

/** Short spoken name, e.g. "NinjaOne ALERT-48213" or "Fathom, Priya Nair at 00:14:32". */
export function sourceName(source: Source): string {
  const tool = TOOL_NAMES[source.tool];
  return source.kind === 'meeting'
    ? `${tool}, ${source.speakerName} at ${source.transcriptAt}`
    : `${tool} ${source.recordId}`;
}

/** One field of a record, e.g. a Fathom recording's summary; null without it. */
export function sourceField(source: Source, label: string): string | null {
  return source.fields.find((field) => field.label === label)?.value ?? null;
}

/** Distinct tool names in first-seen order, e.g. "NinjaOne · Fathom". */
export function sourceTools(sources: Source[]): string {
  return [...new Set(sources.map((source) => TOOL_NAMES[source.tool]))].join(
    ' · ',
  );
}
