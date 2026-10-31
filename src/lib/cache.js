// In-process application cache.
//
// Reads that every page repeats (the signed-in user, the pending-orders badge, dashboard totals,
// customer lists) are kept in memory for a short time. Every write invalidates exactly the tags it
// affects, so nobody sees stale numbers after a save; the TTL is only a safety net for changes made
// outside the app (e.g. a database restore). Concurrent misses for the same key share one database
// call. The app runs as a single Node process, so memory is the right place for this — no extra
// service to run or keep in sync.

const store = (globalThis.__rqCache ??= {
  entries: new Map(), // key -> { value, expires, tags }
  inflight: new Map(), // key -> { promise, tags }
  versions: new Map(), // tag -> number, bumped on every invalidation
  stats: { hits: 0, misses: 0, invalidations: 0 },
});
const MAX_ENTRIES = 1000;

export const TAGS = {
  users: "users",
  orders: "orders",
  payments: "payments",
  customers: "customers",
  expenses: "expenses",
  attendance: "attendance",
  staff: "staff",
  stock: "stock",
  vehicles: "vehicles",
};

/** Returns the cached value for key, or runs load(), caches it for ttlSeconds under tags. */
export async function cached(key, { tags, ttl = 60 }, load) {
  const hit = store.entries.get(key);
  if (hit && hit.expires > Date.now()) {
    store.stats.hits++;
    return hit.value;
  }
  const pending = store.inflight.get(key);
  if (pending) return pending.promise;

  store.stats.misses++;
  const version = tagVersion(tags);
  const promise = (async () => {
    try {
      const value = await load();
      // A write landed while we were loading: serve this result once, but don't keep it.
      if (tagVersion(tags) === version) {
        if (store.entries.size >= MAX_ENTRIES) store.entries.delete(store.entries.keys().next().value);
        store.entries.set(key, { value, expires: Date.now() + ttl * 1000, tags });
      }
      return value;
    } finally {
      if (store.inflight.get(key)?.promise === promise) store.inflight.delete(key);
    }
  })();
  store.inflight.set(key, { promise, tags });
  return promise;
}

const tagVersion = (tags) => tags.map((t) => store.versions.get(t) ?? 0).join(".");

/** Drops every cached entry carrying any of the given tags. Call after a write commits. */
export function invalidate(...tags) {
  store.stats.invalidations++;
  for (const t of tags) store.versions.set(t, (store.versions.get(t) ?? 0) + 1);
  // Loads already running started before this write: new callers must not join them.
  for (const [key, { tags: t }] of store.inflight) if (t.some((x) => tags.includes(x))) store.inflight.delete(key);
  for (const [key, entry] of store.entries) {
    if (entry.tags.some((t) => tags.includes(t))) store.entries.delete(key);
  }
}

export function cacheStats() {
  const { hits, misses, invalidations } = store.stats;
  const total = hits + misses;
  return { entries: store.entries.size, hits, misses, invalidations, hitRate: total ? Math.round((hits / total) * 100) : 0 };
}
