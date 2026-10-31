import type { IntelligenceSettings } from '@dossierhq/contracts';

/** Why the Ask box can't take questions now, or null when it can. */
export function askUnavailable(settings: IntelligenceSettings): string | null {
  if (!settings.enabled) {
    return settings.off ?? 'Ask Dossier needs an AI model to answer with.';
  }
  if (!settings.preferences.outputs.ask) {
    return 'Ask Dossier is turned off on the Intelligence page.';
  }
  return null;
}
