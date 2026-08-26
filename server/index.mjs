// Ein Prozess: liefert die App und die API. Keine Abhängigkeiten.
// Rechte hängen am Link, nicht an einem Konto: wer die id hat, darf lesen,
// wer den Schlüssel hat, darf ändern. Deshalb gibt es kein Verzeichnis
// aller Karten und keine Sitzung.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { Ablage, ID_MUSTER } from "./store.mjs";
import { prüfeKarte } from "../app/validate.js";
import { fassung } from "./fassung.mjs";

const APP = new URL("../app/", import.meta.url).pathname;
const MAX_BODY = 256 * 1024;
const TYPEN = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json",
  ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml", ".css":"text/css", ".woff2":"font/woff2" };

const json = (res, code, körper) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8",
                        "Cache-Control": "no-store" });
  res.end(JSON.stringify(körper));
};

async function körperLesen(req) {
  let größe = 0;
  const teile = [];
  for await (const stück of req) {
    größe += stück.length;
    if (größe > MAX_BODY) throw new Error("zu groß");
    teile.push(stück);
  }
  return JSON.parse(Buffer.concat(teile).toString("utf8"));
}

async function api(req, res, ablage, pfad) {
  const teile = pfad.split("/").filter(Boolean);   // ["api","recipes",id?]
  if (teile[1] !== "recipes" || teile.length > 3) return json(res, 404, { fehler: "unbekannt" });
  const id = teile[2];

  if (id !== undefined && !ID_MUSTER.test(id)) return json(res, 404, { fehler: "unbekannt" });

  if (req.method === "POST" && id === undefined) {
    let karte;
    try { karte = await körperLesen(req); }
    catch { return json(res, 400, { fehler: "unlesbarer Körper" }); }
    const fehler = prüfeKarte(karte);
    if (fehler.length) return json(res, 422, { fehler });
    return json(res, 201, await ablage.anlegen(karte));
  }

  if (id === undefined) return json(res, 405, { fehler: "Methode nicht erlaubt" });

  if (req.method === "GET") {
    const karte = await ablage.holen(id);
    if (!karte) return json(res, 404, { fehler: "Karte gibt es nicht" });
    return json(res, 200, karte);
  }

  if (req.method === "PUT" || req.method === "DELETE") {
    // Der Schlüssel steht im Fragment der URL und kommt nur als Kopfzeile
    // hierher: so taucht er weder im Log noch im Referer auf.
    const schlüssel = req.headers["x-edit-key"];
    if (!await ablage.darfÄndern(id, schlüssel))
      return json(res, 403, { fehler: "falscher oder fehlender Schlüssel" });

    if (req.method === "DELETE") {
      await ablage.löschen(id);
      return json(res, 200, { gelöscht: true });
    }
    let karte;
    try { karte = await körperLesen(req); }
    catch { return json(res, 400, { fehler: "unlesbarer Körper" }); }
    const fehler = prüfeKarte(karte);
    if (fehler.length) return json(res, 422, { fehler });
    return json(res, 200, await ablage.ersetzen(id, karte));
  }

  return json(res, 405, { fehler: "Methode nicht erlaubt" });
}

async function statisch(req, res, pfad) {
  // /r/<id> liest, /r/<id>/<schlüssel> ändert. Beides ist dieselbe Seite;
  // was sie darf, entscheidet der Schlüssel im Pfad.
  const datei = /^\/r\/[^/]+(\/[^/]+)?\/?$/.test(pfad) ? join(APP, "karte.html")
              : join(APP, pfad === "/" ? "index.html" : pfad);
  try {
    let körper = await readFile(datei);
    const flüchtig = /\/(index|karte)\.html$|\/sw\.js$/.test(datei);
    if (datei.endsWith("/sw.js"))
      körper = Buffer.from(körper.toString("utf8")
        .replace('"lekka-dev"', JSON.stringify(await fassung(APP))));
    res.writeHead(200, {
      "Content-Type": TYPEN[extname(datei)] ?? "application/octet-stream",
      "Cache-Control": flüchtig ? "no-cache" : "max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    res.end(req.method === "HEAD" ? undefined : körper);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("nicht gefunden");
  }
}

export async function starten({ port = 8080, datenVerzeichnis } = {}) {
  const ablage = await new Ablage(
    datenVerzeichnis ?? new URL("../data/", import.meta.url).pathname).bereit();

  const server = createServer(async (req, res) => {
    const pfad = normalize(decodeURIComponent(req.url.split("?")[0]))
      .replace(/^(\.\.[/\\])+/, "");
    try {
      if (pfad.startsWith("/api/")) await api(req, res, ablage, pfad);
      else if (req.method === "GET" || req.method === "HEAD") await statisch(req, res, pfad);
      else json(res, 405, { fehler: "Methode nicht erlaubt" });
    } catch (fehler) {
      console.error(fehler);
      if (!res.headersSent) json(res, 500, { fehler: "interner Fehler" });
    }
  });

  await new Promise((fertig, schief) => {
    server.on("error", schief);
    server.listen(port, fertig);
  });
  return { server, ablage, port: server.address().port };
}

// Direkt gestartet, nicht importiert.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT ?? 8080);
  try {
    await starten({ port, datenVerzeichnis: process.env.DATA_DIR });
    console.log(`http://localhost:${port}`);
  } catch (fehler) {
    if (fehler.code !== "EADDRINUSE") throw fehler;
    console.error(`Port ${port} ist belegt. Läuft der Server schon?`);
    console.error(`Belegenden Prozess zeigen:  lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    console.error(`Anderen Port benutzen:      PORT=8081 mise run dev`);
    process.exit(1);
  }
}
