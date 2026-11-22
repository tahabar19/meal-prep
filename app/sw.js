// Mon Meal Prep — service worker : l'interface et les photos du catalogue restent en cache (réseau d'abord pour
// l'interface, pour avoir toujours la dernière version ; cache d'abord pour les photos, qui ne changent pas).
const VERSION = "meal-prep-web-2026-11-22-112341";
const FICHIERS = ["./", "index.html", "app.css", "app.js", "web.js", "moteur.js", "config.js", "icones.js", "graphiques.js",
                  "vendor/supabase.js", "manifest.webmanifest", "icone.svg", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== "photos").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.includes("/photos/")) {
    e.respondWith(caches.open("photos").then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((n) => { if (n.ok) c.put(e.request, n.clone()); return n; }))));
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./")))
  );
});
