import type { IntelligenceSettings } from '@dossierhq/contracts';

/** Why the Ask box can't take questions now, or null when it can. */
export function askUnavailable(settings: IntelligenceSettings): string | null {
  if (!settings.enabled) {
    return 'Ask Dossier needs Claude. Set ANTHROPIC_API_KEY on the API to turn it on.';
  }
  if (!settings.preferences.outputs.ask) {
    return 'Ask Dossier is turned off on the Intelligence page.';
  }
  return null;
}
