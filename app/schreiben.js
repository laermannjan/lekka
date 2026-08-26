// Zurück in den Baum. Der Editor ändert das gezeichnete Raster, gespeichert
// wird aber die Karte - hier liegt die Übersetzung.
import { parseZutat } from "./layout.js";
import { zeigeMenge } from "./menge.js";

const KLAMMER = /^(.*?)\s*\(([^()]*)\)\s*$/;

// Aus den vier Feldern wieder eine Zeile, immer in derselben Form.
export function alsText({ amount, unit, name, qual }) {
  const links = qual ? `${name} (${qual})` : name;
  const rechts = [zeigeMenge(amount), unit].filter(Boolean).join(" ");
  return rechts ? `${links}: ${rechts}` : links;
}

// Eine Zutat behält die Form, in der sie dasteht: wer sie als Objekt
// geschrieben hat, bekommt kein String zurück und umgekehrt.
export function schreibeZutat(herkunft, i, felder) {
  const { eltern, index } = herkunft.zutaten[i];
  const alt = eltern.in[index];
  const neu = { ...parseZutat(alt), ...felder };
  eltern.in[index] = typeof alt === "string"
    ? alsText(neu)
    : { ...alt, amount: neu.amount, unit: neu.unit, name: neu.name, qual: neu.qual };
  return eltern.in[index];
}

// Ein Hinweis in Klammern am Verb wird beim Ändern zu einem eigenen Feld.
// Sonst stünde er zweimal da, sobald jemand das Verb anfasst.
export function schreibeSchritt(herkunft, i, felder) {
  const { knoten } = herkunft.schritte[i];
  const k = KLAMMER.exec(knoten.do.trim());
  const jetzt = {
    text: k ? k[1] : knoten.do.trim(),
    note: knoten.note ?? (k ? k[2].trim() : "")
  };
  const neu = { ...jetzt, ...felder };
  knoten.do = neu.text;
  if (neu.note) knoten.note = neu.note; else delete knoten.note;
  return knoten;
}

export function schreibeZeile(rezept, feld, i, wert) {
  const liste = rezept[feld] ?? (rezept[feld] = []);
  if (wert) liste[i] = wert; else liste.splice(i, 1);
  if (liste.length === 0) delete rezept[feld];
}
