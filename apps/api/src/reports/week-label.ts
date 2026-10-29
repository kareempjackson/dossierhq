/** `2026-10-05` → "the week of 5 Oct 2026", for the audit log. */
export const weekOf = (weekStart: string) =>
  `the week of ${new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(
    'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' },
  )}`;
