// Der Zwischenspeicher ist reiner Rückfall für den Fall ohne Netz, keine
// Abkürzung. Online gewinnt immer das Netz - sonst zeigt der Browser nach
// einer Änderung noch tagelang die alte App, ohne dass man es merkt.
//
// Der Server ersetzt die Fassung beim Ausliefern durch den Hash von app/.
// Wer app/ ohne diesen Server ausliefert, bekommt eine feste Version.
const V = "lekka-dev";
const HÜLLE = ["/", "/index.html", "/karte.html", "/uebersicht.js", "/karte.js",
  "/layout.js", "/render.js", "/validate.js", "/api.js", "/liste.js", "/transfer.js",
  "/stil.css", "/manifest.webmanifest", "/icon.svg",
  "/menge.js", "/ansichten.js", "/editor.js", "/notation.js", "/schreiben.js", "/aenderungen.js", "/schrift/plex.css", "/schrift/plex.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(HÜLLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function netzZuerst(request, rückfall) {
  const speicher = await caches.open(V);
  try {
    const antwort = await fetch(request);
    if (antwort.ok) speicher.put(request, antwort.clone());
    return antwort;
  } catch (fehler) {
    const gespeichert = await speicher.match(request, { ignoreSearch: true })
      ?? (rückfall && await speicher.match(rückfall));
    if (gespeichert) return gespeichert;
    throw fehler;
  }
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Jede Karten-URL zeigt dieselbe Seite; ohne Netz kommt sie aus der Hülle.
  const rückfall = /^\/r\//.test(url.pathname) ? "/karte.html" : null;
  e.respondWith(netzZuerst(e.request, rückfall));
});
