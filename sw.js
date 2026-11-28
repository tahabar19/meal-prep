// Mon Meal Prep — service worker : l'interface et les photos du catalogue restent en cache (réseau d'abord pour
// l'interface, pour avoir toujours la dernière version ; cache d'abord pour les photos, qui ne changent pas).
const VERSION = "meal-prep-web-2026-11-28-124354";
const FICHIERS = ["./", "index.html", "app.css", "app.js", "web.js", "moteur.js", "config.js", "icones.js", "graphiques.js", "miroir.js", "scan.js",
                  "vendor/supabase.js", "manifest.webmanifest", "icone.svg", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== "photos" && k !== "miroir" && k !== "scanner").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  // La détection du corps (silhouette au miroir, 27/11/2026) : ≈ 19 Mo chargés une fois, gardés ensuite.
  if (e.request.method === "GET" && (u.href.startsWith("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@")
      || u.href.startsWith("https://storage.googleapis.com/mediapipe-models/"))) {
    e.respondWith(caches.open("miroir").then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((n) => { if (n.ok) c.put(e.request, n.clone()); return n; }))));
    return;
  }
  // Le lecteur de codes-barres (28/11/2026) : ≈ 1 Mo (script + WebAssembly), chargé une fois, gardé ensuite.
  if (e.request.method === "GET" && (u.href.startsWith("https://cdn.jsdelivr.net/npm/barcode-detector@")
      || u.href.startsWith("https://cdn.jsdelivr.net/npm/zxing-wasm@"))) {
    e.respondWith(caches.open("scanner").then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((n) => { if (n.ok) c.put(e.request, n.clone()); return n; }))));
    return;
  }
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

// Notifications (Taha, 27/11/2026) : affichées même appli fermée ; les toucher ouvre l'appli au bon endroit.
self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { corps: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(m.titre || "Mon Meal Prep", {
    body: m.corps || "", tag: m.tag || "mon-meal-prep", icon: "apple-touch-icon.png", badge: "icone.svg",
    data: { url: m.url || "#/semaine" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const cible = new URL("./" + ((e.notification.data && e.notification.data.url) || ""), self.registration.scope).href;
  const ici = (e.notification.data && e.notification.data.url) || "#/semaine";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
    const f = fenetres.find((c) => c.url.startsWith(self.registration.scope));
    if (!f) return self.clients.openWindow(cible);
    f.postMessage({ type: "aller", url: ici });             // l'appli ouverte va au bon écran, sans recharger
    return f.focus();
  }));
});
