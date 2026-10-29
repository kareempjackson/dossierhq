import { sourceOrigin, type Source } from '@dossierhq/contracts';
import { formatDate, formatTimestamp } from './format';

/**
 * The mono line under a cited statement.
 * Records: "NinjaOne · ALERT-48213 · 9 Oct 2026, 02:14"
 * Meetings: "Fathom · 30 Sept 2026 · 00:14:32 · Priya Nair, client"
 * Notes: "Meeting notes · Site walk · 12 Oct 2026"
 */
export function sourceLineText(source: Source, timeZone: string): string {
  const origin = sourceOrigin(source);
  if (source.kind === 'meeting') {
    return [
      origin,
      formatDate(source.recordedAt, timeZone),
      source.transcriptAt,
      `${source.speakerName}, ${source.speakerRole === 'client' ? 'client' : 'MSP'}`,
    ].join(' · ');
  }
  if (source.kind === 'note') {
    return [origin, source.title, formatDate(source.recordedAt, 'UTC')].join(
      ' · ',
    );
  }
  return [
    origin,
    source.recordId,
    formatTimestamp(source.recordedAt, timeZone),
  ].join(' · ');
}

/**
 * Short spoken name, e.g. "NinjaOne ALERT-48213", "Fathom, Priya Nair at
 * 00:14:32" or "Meeting notes, Site walk".
 */
export function sourceName(source: Source): string {
  const origin = sourceOrigin(source);
  switch (source.kind) {
    case 'meeting':
      return `${origin}, ${source.speakerName} at ${source.transcriptAt}`;
    case 'note':
      return `${origin}, ${source.title}`;
    case 'record':
      return `${origin} ${source.recordId}`;
  }
}

/** One field of a record, e.g. a Fathom recording's summary; null without it. */
export function sourceField(source: Source, label: string): string | null {
  return source.fields.find((field) => field.label === label)?.value ?? null;
}

/** Distinct origins in first-seen order, e.g. "NinjaOne · Fathom". */
export function sourceTools(sources: Source[]): string {
  return [...new Set(sources.map(sourceOrigin))].join(' · ');
}
