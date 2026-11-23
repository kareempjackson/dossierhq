/**
 * Remembers what a read gave for a short while, per key, in this process.
 * For values read on almost every model call and changed a few times a
 * year: a workspace's model, keys and preferences. Whoever writes the value
 * calls `forget`, so this process never serves its own stale write; another
 * process catches up when the entry runs out.
 */
export class TtlCache<T> {
  private readonly entries = new Map<
    string,
    { value: Promise<T>; until: number }
  >();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** The remembered value, or `load`'s, remembered from now. A failed load isn't kept. */
  get(key: string, load: () => Promise<T>): Promise<T> {
    const at = this.now();
    const held = this.entries.get(key);
    if (held && held.until > at) return held.value;
    const value = load();
    this.entries.set(key, { value, until: at + this.ttlMs });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    // Entries of workspaces that went quiet don't pile up.
    if (this.entries.size > 5_000) {
      for (const [k, entry] of this.entries) {
        if (entry.until <= at) this.entries.delete(k);
      }
    }
    return value;
  }

  forget(key: string): void {
    this.entries.delete(key);
  }
}
