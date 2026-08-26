// Bearbeiten in der Karte selbst. Werte ändert man dort, wo sie stehen;
// die Struktur des Baums bleibt dem JSON-Feld vorbehalten, weil Umhängen
// selten ist und Vertippen häufig.
import { layout } from "./layout.js";
import { schreibeZutat, schreibeSchritt } from "./schreiben.js";
import { parseMenge, zeigeMenge, skaliere, rechenbar } from "./menge.js";

// Was in welchem Feld steht, und wie es zurück in den Baum kommt.
const FELDER = {
  // Was keine Zahl und keine Spanne ist, bleibt als Text stehen.
  menge: { zutat: true, lesen: t => ({ amount: parseMenge(t) ?? (t || null) }) },
  einheit: { zutat: true, lesen: t => ({ unit: t }) },
  name: { zutat: true, lesen: t => ({ name: t }) },
  qual: { zutat: true, lesen: t => ({ qual: t }) },
  verb: { zutat: false, lesen: t => ({ text: t }) },
  hinweis: { zutat: false, lesen: t => ({ note: t }) }
};

// Die Menge wird beim Anzeigen mit dem Faktor multipliziert. Wer bei 2× eine
// Zahl eintippt, meint die doppelte Menge, gespeichert wird die einfache.
const zurückRechnen = (felder, faktor) =>
  "amount" in felder && rechenbar(felder.amount)
    ? { amount: skaliere(felder.amount, 1 / faktor) }
    : felder;

export function bearbeitbar(ziel, rezept, { faktor = 1, beiÄnderung } = {}) {
  let herkunft = layout(rezept).herkunft;

  // Was ein Feld anzeigen soll, aus dem Baum gelesen. Nach dem Verlassen wird
  // damit nachgeführt, was aus der Eingabe geworden ist: 0,5 wird zu ½.
  const anzeige = (el) => {
    const { rows, cells } = layout(rezept);
    const art = el.dataset.feld;
    if (art === "titel") return rezept.title;
    if (art === "prep") return rezept.prep?.[Number(el.dataset.stelle)] ?? "";
    if (FELDER[art]?.zutat) {
      const r = rows[Number(el.dataset.zeile)];
      return art === "menge" ? zeigeMenge(skaliere(r.amount, faktor))
           : art === "einheit" ? r.unit
           : art === "name" ? r.name : r.qual;
    }
    const c = cells[Number(el.dataset.zelle)];
    return art === "verb" ? c.text : c.note;
  };

  for (const el of ziel.querySelectorAll("[data-feld]")) {
    const art = el.dataset.feld;
    el.contentEditable = "plaintext-only";
    el.spellcheck = false;

    el.addEventListener("input", () => {
      const text = el.textContent.trim();
      if (art === "titel") rezept.title = text;
      else if (art === "prep") rezept.prep[Number(el.dataset.stelle)] = text;
      else if (FELDER[art]?.zutat)
        schreibeZutat(herkunft, Number(el.dataset.zeile),
          zurückRechnen(FELDER[art].lesen(text), faktor));
      else if (FELDER[art])
        schreibeSchritt(herkunft, Number(el.dataset.zelle), FELDER[art].lesen(text));
      beiÄnderung?.();
    });

    // Nur dieses eine Feld nachführen. Alles neu zu zeichnen würde das Element
    // ersetzen, in das gerade geklickt wird, und die nächste Eingabe verlieren.
    el.addEventListener("blur", () => {
      const soll = anzeige(el);
      if (el.textContent !== soll) el.textContent = soll;
      herkunft = layout(rezept).herkunft;
    });
  }
}

export function abschalten(ziel) {
  for (const el of ziel.querySelectorAll("[data-feld]")) el.contentEditable = "false";
}
