// Offline support for the web version: after one visit the app works with no network. It caches only this
// site's own files (the app); returns live in the browser's OPFS and never pass through here.
const CACHE = "ebirforms-web-v2";
const SHELL = ["/", "/form", "/manifest.webmanifest", "/icon-256.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    fetch("/sw-asset.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((asset) => caches.open(CACHE).then((c) => c.addAll([...SHELL, ...asset.filter((a) => a !== "/index.html")])))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((key) => Promise.all(key.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // pages: network first (new versions), the cached app shell offline — every route is the same index.html
    e.respondWith(fetch(req).catch(() => caches.match("/").then((r) => r || caches.match("/form"))));
    return;
  }
  // hashed assets: cache first, filled as they load
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
