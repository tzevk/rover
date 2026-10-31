// Keeps the gate screen open when the connection drops. Only /gate and its scripts are stored here;
// it holds no business data, and every signed-in page stays online-only so it can never go stale.
const PREFIX = "rk-gate-";
const GATE = "/gate";

async function storeGate() {
  const res = await fetch(GATE, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) return;
  const html = await res.clone().text();
  const assets = new Set(["/icon.svg"]);
  for (const [url] of html.matchAll(/\/_next\/static\/[^"'\\\s)]+/g)) assets.add(url.replaceAll("&amp;", "&"));
  for (const [path] of html.matchAll(/(?<=["'])static\/chunks\/[^"'\\\s)]+/g)) assets.add(`/_next/${path}`);

  // Filled completely before the old copy goes, so a dropped connection here leaves the last good one.
  const name = `${PREFIX}${Date.now()}`;
  const cache = await caches.open(name);
  try {
    await cache.addAll([...assets]);
    await cache.put(GATE, res);
  } catch {
    await caches.delete(name);
    return;
  }
  // Only ever older copies, so a slower refresh can't remove a newer one.
  const stamp = (key) => Number(key.slice(PREFIX.length));
  const old = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && stamp(k) < stamp(name));
  await Promise.all(old.map((k) => caches.delete(k)));
}

// One at a time. Two refreshes at once could each delete the other's copy and leave nothing.
let queue = Promise.resolve();
const refreshGate = () => {
  queue = queue.then(storeGate).catch(() => {});
  return queue;
};

self.addEventListener("install", (event) => {
  event.waitUntil(refreshGate().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The app asks for this while online, so the stored screen follows each new release.
self.addEventListener("message", (event) => {
  if (event.data === "refresh-gate") event.waitUntil(refreshGate());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? fetch(request)));
    return;
  }
  // Any page asked for without a connection opens the gate screen instead of a browser error.
  // One failed request can just be a blip, so it's tried again before anyone is moved off their page.
  if (request.mode === "navigate") {
    const again = () => new Promise((resolve) => { setTimeout(resolve, 400); }).then(() => fetch(request));
    event.respondWith(fetch(request).catch(again).catch(async () => (await caches.match(GATE)) ?? Response.error()));
  }
});
