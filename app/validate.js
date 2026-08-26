// Prüft eine Karte gegen rezeptkarte/1. Läuft im Browser und im Server,
// deshalb ohne Abhängigkeiten. schema/rezeptkarte-1.schema.json bleibt die
// maßgebliche Beschreibung; test/validate.test.js hält beide deckungsgleich.

const ID = /^[A-Za-z0-9_-]{8,}$/;
const ZEITPUNKT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const istObjekt = w => typeof w === "object" && w !== null && !Array.isArray(w);
const istText = w => typeof w === "string" && w.length > 0;

// Eine Menge ist eine Zahl, eine Spanne {von, bis}, ein Text wie
// „nach Geschmack“ oder nichts. Text und Spanne kann man nicht multiplizieren,
// deshalb unterscheidet die Anzeige sie - gültig sind sie alle.
function istMenge(wert) {
  if (wert === null || typeof wert === "number" || typeof wert === "string") return true;
  return istObjekt(wert) && typeof wert.von === "number" && typeof wert.bis === "number";
}

function prüfeZutat(zutat, pfad, fehler) {
  if (typeof zutat === "string") {
    if (!zutat) fehler.push(`${pfad}: leere Zutat`);
    return;
  }
  if (!istObjekt(zutat)) return void fehler.push(`${pfad}: Zutat ist weder Text noch Objekt`);
  if (!istText(zutat.name)) fehler.push(`${pfad}: name fehlt`);
  if ("amount" in zutat && !istMenge(zutat.amount))
    fehler.push(`${pfad}: amount ist weder Zahl, Spanne, Text noch null`);
  for (const feld of ["unit", "qual"])
    if (feld in zutat && typeof zutat[feld] !== "string")
      fehler.push(`${pfad}: ${feld} ist kein Text`);
}

function prüfeSchritt(schritt, pfad, fehler) {
  if (!istObjekt(schritt)) return void fehler.push(`${pfad}: Schritt ist kein Objekt`);
  if (!istText(schritt.do)) fehler.push(`${pfad}: do fehlt`);
  if ("note" in schritt && typeof schritt.note !== "string")
    fehler.push(`${pfad}: note ist kein Text`);
  if (!Array.isArray(schritt.in) || schritt.in.length === 0)
    return void fehler.push(`${pfad}: in braucht mindestens ein Element`);

  schritt.in.forEach((kind, i) => {
    const unter = `${pfad}.in[${i}]`;
    if (istObjekt(kind) && "do" in kind) prüfeSchritt(kind, unter, fehler);
    else prüfeZutat(kind, unter, fehler);
  });
}

// Gibt die Liste der Fehler zurück; leer heißt gültig.
export function prüfeKarte(karte) {
  const fehler = [];
  if (!istObjekt(karte)) return ["Karte ist kein Objekt"];

  if (karte.schema !== "rezeptkarte/1") fehler.push('schema muss "rezeptkarte/1" sein');
  if (!istText(karte.title)) fehler.push("title fehlt");
  if ("yield" in karte && typeof karte.yield !== "string") fehler.push("yield ist kein Text");
  if ("id" in karte && !(typeof karte.id === "string" && ID.test(karte.id)))
    fehler.push("id passt nicht zum Muster");
  if ("updatedAt" in karte && !(typeof karte.updatedAt === "string" && ZEITPUNKT.test(karte.updatedAt)))
    fehler.push("updatedAt ist kein Zeitpunkt");

  for (const feld of ["meta", "prep"]) {
    if (!(feld in karte)) continue;
    if (!Array.isArray(karte[feld]) || karte[feld].some(w => typeof w !== "string"))
      fehler.push(`${feld} ist keine Liste von Texten`);
  }

  if (!("step" in karte)) fehler.push("step fehlt");
  else prüfeSchritt(karte.step, "step", fehler);

  return fehler;
}

export const istGültig = karte => prüfeKarte(karte).length === 0;
