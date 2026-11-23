type PickupCredential = { reference: string; expiresAt: string };
type PickupCode = { code: string; expiresAt: string };
type Kind = 'qr' | 'code';
type Entry = { generation: number; value?: PickupCredential | PickupCode; pending?: Promise<PickupCredential | PickupCode>; expiry?: ReturnType<typeof setTimeout> };

/** Short-lived process memory only. Never persist credentials on the device. */
export function createFulfillmentPickupCache() {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();
  const notify = (scope: string) => listeners.get(scope)?.forEach((listener) => listener());
  const cacheKey = (scope: string, kind: Kind) => JSON.stringify([scope, kind]);
  function get<T extends PickupCredential | PickupCode>(scope: string, kind: Kind): T | undefined {
    const key = cacheKey(scope, kind);
    const entry = entries.get(key);
    if (!entry?.value) return undefined;
    if (!Number.isFinite(Date.parse(entry.value.expiresAt)) || Date.parse(entry.value.expiresAt) <= Date.now()) {
      entry.value = undefined;
      if (entry.expiry) clearTimeout(entry.expiry);
      if (!entry.pending) entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }
  function invalidate(scope: string) {
    for (const kind of ['qr', 'code'] as const) {
      const key = cacheKey(scope, kind);
      const entry = entries.get(key);
      if (entry) { entry.generation += 1; entry.value = undefined; if (entry.expiry) clearTimeout(entry.expiry); if (!entry.pending) entries.delete(key); }
    }
    notify(scope);
  }
  function subscribe(scope: string, listener: () => void) {
    const group = listeners.get(scope) ?? new Set<() => void>();
    group.add(listener);
    listeners.set(scope, group);
    return () => { group.delete(listener); if (!group.size) listeners.delete(scope); };
  }
  function issue<T extends PickupCredential | PickupCode>(scope: string, kind: Kind, load: () => Promise<T>, refresh = false): Promise<T> {
    const key = cacheKey(scope, kind);
    let entry = entries.get(key);
    if (entry?.pending) return entry.pending as Promise<T>;
    const cached = get<T>(scope, kind);
    if (cached && !refresh) return Promise.resolve(cached);
    entry = entries.get(key) ?? { generation: 0 };
    if (entry.expiry) clearTimeout(entry.expiry);
    entry.value = undefined;
    const current = entry;
    const generation = ++current.generation;
    entries.set(key, current);
    notify(scope);
    const request = Promise.resolve().then(load).then((value) => {
      if (current.generation !== generation) throw new Error('Pickup credential is no longer available');
      if (!Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now()) throw new Error('Pickup credential expired');
      current.value = value;
      current.expiry = setTimeout(() => {
        if (current.generation !== generation) return;
        current.value = undefined;
        if (!current.pending && entries.get(key) === current) entries.delete(key);
        notify(scope);
      }, Math.max(0, Date.parse(value.expiresAt) - Date.now()));
      notify(scope);
      return value;
    }).finally(() => { current.pending = undefined; if (!current.value && entries.get(key) === current) entries.delete(key); });
    current.pending = request;
    return request;
  }
  return { get, issue, invalidate, subscribe };
}

export const fulfillmentPickupCache = createFulfillmentPickupCache();
