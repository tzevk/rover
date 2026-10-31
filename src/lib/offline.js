// The device's side of offline working: a snapshot of what the gate needs, and a queue of entries
// waiting to be sent. Browser-only. IndexedDB survives closing the tab and restarting the device.
const DB_NAME = "rk-offline";
export const OFFLINE_EVENT = "rk-offline-change";

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("meta");
      request.result.createObjectStore("queue", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(store, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = work(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const changed = () => window.dispatchEvent(new Event(OFFLINE_EVENT));

export const getSnapshot = () => run("meta", "readonly", (s) => s.get("snapshot"));
const saveSnapshot = (value) => run("meta", "readwrite", (s) => s.put(value, "snapshot"));
export const clearSnapshot = () => run("meta", "readwrite", (s) => s.delete("snapshot"));

export const queued = () => run("queue", "readonly", (s) => s.getAll());
export const enqueue = async (entry) => { await run("queue", "readwrite", (s) => s.put(entry)); changed(); };
export const discard = async (id) => { await run("queue", "readwrite", (s) => s.delete(id)); changed(); };

export async function refreshSnapshot() {
  const res = await fetch("/api/offline/snapshot", { cache: "no-store" });
  if (!res.ok) return null;
  const snapshot = await res.json();
  await saveSnapshot(snapshot);
  return snapshot;
}

// Oldest first, so invoices are numbered in the order entries were made. An entry leaves the queue
// only once the server confirms it; a lost reply just sends it again, and the server ignores repeats.
export async function syncQueue() {
  const waiting = (await queued()).filter((e) => !e.rejected).sort((a, b) => a.saved_at - b.saved_at);
  const outcome = { sent: 0, rejected: 0, signIn: false };
  for (let i = 0; i < waiting.length; i += 20) {
    const res = await fetch("/api/offline/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: waiting.slice(i, i + 20) }),
    });
    if (res.status === 401) return { ...outcome, signIn: true };
    if (!res.ok) throw new Error(`sync ${res.status}`);
    const { results } = await res.json();
    for (const r of results) {
      if (r.status === "done") {
        await discard(r.id);
        outcome.sent++;
      } else if (r.status === "rejected") {
        const entry = waiting.find((e) => e.id === r.id);
        await enqueue({ ...entry, rejected: r.reason });
        outcome.rejected++;
      }
    }
  }
  return outcome;
}
