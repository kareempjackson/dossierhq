/**
 * Filter options for a DataList: the values that actually occur, in the
 * order `labels` lists them, so a filter never offers a choice with nothing
 * behind it.
 */
export function presentOptions<T extends string>(
  values: Iterable<T>,
  labels: Record<T, string>,
): { value: T; label: string }[] {
  const seen = new Set(values);
  return (Object.keys(labels) as T[])
    .filter((value) => seen.has(value))
    .map((value) => ({ value, label: labels[value] }));
}
