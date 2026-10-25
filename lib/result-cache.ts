// Bounded process cache + in-flight deduplication. Never retains failures.
export function resultCache<T>(ttl = 15 * 60 * 1000, limit = 128) {
  const values = new Map<string, { value: T; until: number }>();
  const pending = new Map<string, Promise<T>>();
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = values.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    if (pending.has(key)) return pending.get(key)!;
    const work = Promise.resolve()
      .then(load)
      .then((value) => {
        for (const [k, v] of values) if (v.until <= Date.now()) values.delete(k);
        if (values.size >= limit) values.delete(values.keys().next().value!);
        values.set(key, { value, until: Date.now() + ttl });
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}
