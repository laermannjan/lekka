// Import und Export. Eine einzelne Karte ist rezeptkarte/1, damit sie sich
// mit anderen Werkzeugen lesen lässt. Das Bündel ist die Sicherung dieses
// Geräts und enthält die Schlüssel - es ist so vertraulich wie die Links selbst.
import { prüfeKarte } from "./validate.js";
import * as api from "./api.js";
import * as liste from "./liste.js";

export const BÜNDEL = "lekka-buendel/1";

export function herunterladen(name, daten) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(daten, null, 2)],
    { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export const dateiname = titel =>
  `${(titel || "rezept").toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "")}.json`;

export async function bündelBauen() {
  const karten = [];
  for (const eintrag of liste.alle()) {
    const karte = await api.holen(eintrag.id).catch(() => null);
    if (karte) karten.push({ id: eintrag.id, schlüssel: eintrag.schlüssel, karte });
  }
  return { schema: BÜNDEL, exportiertAm: new Date().toISOString(), karten };
}

// Nimmt eine einzelne Karte oder ein Bündel. Karten, die es auf dem Server
// noch gibt, werden nur wieder in die Liste eingetragen; verlorene werden neu
// hochgeladen und bekommen dabei neue Links.
export async function einlesen(text) {
  let daten;
  try { daten = JSON.parse(text); }
  catch { throw new Error("Die Datei ist kein JSON."); }

  const einträge = daten?.schema === BÜNDEL
    ? (Array.isArray(daten.karten) ? daten.karten : [])
    : [{ karte: daten }];
  if (einträge.length === 0) throw new Error("Die Datei enthält keine Karte.");

  const bericht = { verknüpft: 0, neu: 0, fehler: [] };
  for (const [i, eintrag] of einträge.entries()) {
    const karte = eintrag.karte;
    const fehler = prüfeKarte(karte);
    if (fehler.length) {
      bericht.fehler.push(`${karte?.title ?? `Karte ${i + 1}`}: ${fehler[0]}`);
      continue;
    }
    if (eintrag.id && await api.holen(eintrag.id).catch(() => null)) {
      liste.merken({ id: eintrag.id, schlüssel: eintrag.schlüssel, titel: karte.title });
      bericht.verknüpft++;
      continue;
    }
    try {
      const { id, schlüssel } = await api.anlegen(karte);
      liste.merken({ id, schlüssel, titel: karte.title });
      bericht.neu++;
    } catch (f) {
      bericht.fehler.push(`${karte.title}: ${f.message}`);
    }
  }
  return bericht;
}
