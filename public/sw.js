// Podio Clone service worker.
// - Precaches /offline + /icon.svg
// - Network-first for navigations (offline fallback page)
// - Cache-first (stale-while-revalidate) for the icon and /_next/static assets
// - Web push display + click-through to /notifications

const CACHE = "podio-v1";
const PRECACHE = ["/offline", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches
          .match("/offline")
          .then((cached) => cached ?? new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  if (url.pathname === "/icon.svg" || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetched = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload: show the generic notification.
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Podio Clone", {
      body: data.body,
      icon: "/icon.svg",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url ?? "/notifications")
  );
});
