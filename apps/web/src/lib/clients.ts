import type { Client } from '@dossierhq/contracts';

/**
 * What is known about a client in one line, e.g. "Dental practice ·
 * Portsmouth · 22 seats". Null when the tools know nothing beyond the name.
 */
export function clientSummary(
  client: Client,
  { detailed = true }: { detailed?: boolean } = {},
): string | null {
  const parts = [
    client.industry,
    client.location,
    ...(detailed
      ? [
          client.seats != null ? `${client.seats} seats` : null,
          client.contract?.plan,
          client.primaryContact
            ? [
                client.primaryContact.name,
                client.primaryContact.role.toLowerCase(),
              ]
                .filter(Boolean)
                .join(', ')
            : null,
        ]
      : []),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}
