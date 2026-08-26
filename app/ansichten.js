// Dieselbe Karte, anders gelesen: als Ablauf und als Einkaufszettel. Beide
// laufen über den Baum, nicht über das Raster, damit „was fließt in diesen
// Schritt" die Antwort des Rezepts bleibt und nicht die der Zeilenspanne.
import { parseZutat } from "./layout.js";
import { skaliere, zeigeMenge, summiere, rechenbar } from "./menge.js";

const istSchritt = k => typeof k === "object" && k !== null && "do" in k;
const KLAMMER = /^(.*?)\s*\(([^()]*)\)\s*$/;

export function zutatText(zutat, faktor = 1) {
  const z = parseZutat(zutat);
  const menge = [zeigeMenge(skaliere(z.amount, faktor)), z.unit].filter(Boolean).join(" ");
  return [menge, z.name].filter(Boolean).join(" ") + (z.qual ? ` (${z.qual})` : "");
}

// Postorder, dieselbe Reihenfolge wie die Zellen im Raster.
export function schritte(rezept, faktor = 1) {
  const liste = [];
  (function gehe(knoten) {
    if (!istSchritt(knoten)) return;
    for (const kind of knoten.in) gehe(kind);
    const k = KLAMMER.exec(knoten.do.trim());
    liste.push({
      text: k ? k[1] : knoten.do.trim(),
      note: knoten.note ?? (k ? k[2].trim() : ""),
      zutaten: knoten.in.filter(kind => !istSchritt(kind)).map(z => zutatText(z, faktor))
    });
  })(rezept.step);
  return liste;
}

// Gleiche Zutat in gleicher Einheit wird zusammengezählt, die einzelnen
// Verwendungen bleiben sichtbar - beim Einkauf zählt die Summe, beim Backen
// die Aufteilung.
export function einkauf(rezept, faktor = 1) {
  const gruppen = new Map();
  (function gehe(knoten) {
    if (!istSchritt(knoten)) {
      const z = parseZutat(knoten);
      const schlüssel = `${z.name.toLowerCase()}|${z.unit}`;
      if (!gruppen.has(schlüssel))
        gruppen.set(schlüssel, { name: z.name, unit: z.unit, qual: z.qual, summe: null, gemessen: false, text: "", teile: [] });
      const g = gruppen.get(schlüssel);
      const menge = skaliere(z.amount, faktor);
      if (rechenbar(menge)) { g.summe = summiere(g.summe, menge); g.gemessen = true; }
      else if (typeof menge === "string") g.text = menge;
      g.teile.push(menge === null ? "?" : [zeigeMenge(menge), z.unit].filter(Boolean).join(" "));
      return;
    }
    for (const kind of knoten.in) gehe(kind);
  })(rezept.step);

  return [...gruppen.values()].map(g => ({
    name: g.name, qual: g.qual,
    menge: g.gemessen ? [zeigeMenge(g.summe), g.unit].filter(Boolean).join(" ")
         : g.text || "nach Bedarf",
    teile: g.teile.length > 1 ? g.teile : []
  }));
}
