/* ============================================================
 * sw.js — Service Worker: StormWatch Global (React Version)
 * Cache app shell, ảnh GIBS, dữ liệu bão
 * ============================================================ */

const CACHE_VERSION = "sw-react-v1";
const APP_CACHE = `app-${CACHE_VERSION}`;
const GIBS_CACHE = `gibs-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;

/* ---------- Tài nguyên app shell (cache-first) ---------- */
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon.svg",
];

/* ---------- Install: cache app shell ---------- */
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then((cache) => {
      console.log("[SW] Caching app shell");
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

/* ---------- Activate: xoá cache cũ ---------- */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== GIBS_CACHE && k !== DATA_CACHE)
          .map((k) => {
            console.log("[SW] Xoá cache cũ:", k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

/* ---------- Fetch strategy ---------- */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Bỏ qua các request không phải GET
  if (e.request.method !== "GET") return;

  // 1) Ảnh vệ tinh NASA GIBS → Stale-While-Revalidate (ảnh rất ít đổi)
  if (url.hostname === "gibs.earthdata.nasa.gov") {
    e.respondWith(staleWhileRevalidate(e.request, GIBS_CACHE));
    return;
  }

  // 2) Dữ liệu bão (GDACS, NHC, Open-Meteo, CORS proxies) → Network-First
  if (
    url.hostname.includes("gdacs.org") ||
    url.hostname.includes("nhc.noaa.gov") ||
    url.hostname.includes("ncei.noaa.gov") ||
    url.hostname.includes("api.open-meteo.com") ||
    url.hostname.includes("allorigins.win") ||
    url.hostname.includes("corsproxy.io")
  ) {
    e.respondWith(networkFirst(e.request, DATA_CACHE, 10000));
    return;
  }

  // 3) CesiumJS CDN assets hoặc local assets → Cache-First
  if (
    url.hostname === "cdn.jsdelivr.net" || 
    url.origin === self.location.origin
  ) {
    e.respondWith(cacheFirst(e.request, APP_CACHE));
    return;
  }
});

/* ---------- Cache strategies ---------- */

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request, cacheName, timeoutMs = 8000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('{"error":"offline"}', {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
}
