const APP_CACHE = "stormwatch-app-v3";
const OLD_CACHES = ["app-sw-react-v2", "gibs-sw-react-v2", "data-sw-react-v2"];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await Promise.all(OLD_CACHES.map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheAsset(request));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await save(cache, "/index.html", response);
    return response;
  } catch {
    return (await cache.match("/index.html")) || new Response("Offline", { status: 503 });
  }
}

async function cacheAsset(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await save(cache, request, response);
  return response;
}

async function save(cache, request, response) {
  try {
    await cache.put(request, response.clone());
  } catch {
    // A full cache should never prevent the online response from loading.
  }
}
