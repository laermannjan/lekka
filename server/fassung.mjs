// Die Cache-Version des Service Workers ist der Inhalt der App, nicht eine
// Zahl, die jemand hochzählen muss. Ändert sich eine Datei, ändert sich die
// Version; ändert sich nichts, bleibt sie gleich und die Clients behalten
// ihren Zwischenspeicher.
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

async function dateien(verzeichnis, stamm = verzeichnis) {
  const einträge = await readdir(verzeichnis, { withFileTypes: true });
  const gefunden = [];
  for (const eintrag of einträge.sort((a, b) => a.name.localeCompare(b.name))) {
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...await dateien(pfad, stamm));
    else gefunden.push([pfad.slice(stamm.length), pfad]);
  }
  return gefunden;
}

export async function fassung(verzeichnis) {
  const hash = createHash("sha256");
  for (const [name, pfad] of await dateien(verzeichnis)) {
    hash.update(name);
    hash.update(await readFile(pfad));
  }
  return `lekka-${hash.digest("hex").slice(0, 12)}`;
}
