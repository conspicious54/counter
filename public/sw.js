const CACHE = "counter-shell-v4";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(["/", "/counter-icon-v2-192.png", "/manifest.webmanifest"]);
      const response = await cache.match("/");
      const html = await response.text();
      const assets = [
        ...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1])),
      ];
      await cache.addAll(assets);
    }),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((c) => c.put("/", clone));
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  // Cache immutable Next chunks and icons. Never cache authenticated API data.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|webmanifest)$/.test(url.pathname))
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE).then((c) => c.put(request, clone));
            }
            return response;
          }),
      ),
    );
});
