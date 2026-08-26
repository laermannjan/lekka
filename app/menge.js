// Eine Menge ist eine Zahl, eine Spanne oder ein Text. Gespeichert wird immer
// die einfache Menge; der Faktor wirkt erst beim Anzeigen.
//
//   300          Zahl, skaliert und zählt zusammen
//   {von, bis}   Spanne, skaliert und zählt zusammen
//   "nach Bedarf" Text, bleibt wie er ist
//   null         keine Angabe
const BRUCH = { "½": 0.5, "⅓": 1/3, "⅔": 2/3, "¼": 0.25, "¾": 0.75, "⅕": 0.2, "⅜": 0.375, "⅛": 0.125 };
const ZEICHEN = { 0.5: "½", 0.25: "¼", 0.75: "¾", 0.125: "⅛" };

export const istSpanne = m => typeof m === "object" && m !== null && "von" in m;
export const istZahl = m => typeof m === "number";
export const rechenbar = m => istZahl(m) || istSpanne(m);

function einzelZahl(wort) {
  const t = String(wort).trim().replace(",", ".");
  if (!t) return null;
  if (t in BRUCH) return BRUCH[t];
  const gemischt = /^(\d+)\s*([½⅓⅔¼¾⅕⅜⅛])$/.exec(t);
  if (gemischt) return Number(gemischt[1]) + BRUCH[gemischt[2]];
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

// "40-60" und "40–60" sind Spannen. Ein Strich mit Text drumherum ist keine.
export function parseMenge(text) {
  if (typeof text === "number" || istSpanne(text)) return text;
  const wort = String(text ?? "").trim();
  if (!wort) return null;
  const strich = /^([^-–]+)[-–]([^-–]+)$/.exec(wort);
  if (strich) {
    const von = einzelZahl(strich[1]), bis = einzelZahl(strich[2]);
    if (von !== null && bis !== null) return { von, bis };
  }
  return einzelZahl(wort);
}

export function zeigeMenge(menge) {
  if (menge === null || menge === undefined) return "";
  if (typeof menge === "string") return menge;
  if (istSpanne(menge)) return `${zeigeMenge(menge.von)}–${zeigeMenge(menge.bis)}`;
  const gerundet = Math.round(menge * 100) / 100;
  const ganz = Math.floor(gerundet);
  const rest = Math.round((gerundet - ganz) * 100) / 100;
  if (ZEICHEN[rest]) return (ganz || "") + ZEICHEN[rest];
  return String(gerundet).replace(".", ",");
}

// Text skaliert nicht: „nach Geschmack" mal zwei ist immer noch nach Geschmack.
export function skaliere(menge, faktor) {
  if (istZahl(menge)) return menge * faktor;
  if (istSpanne(menge)) return { von: menge.von * faktor, bis: menge.bis * faktor };
  return menge ?? null;
}

// Für den Einkaufszettel. Was nicht rechenbar ist, bleibt außen vor.
export function summiere(a, b) {
  if (!rechenbar(a)) return rechenbar(b) ? b : null;
  if (!rechenbar(b)) return a;
  const paar = m => istSpanne(m) ? [m.von, m.bis] : [m, m];
  const [av, ab] = paar(a), [bv, bb] = paar(b);
  return av + bv === ab + bb ? av + bv : { von: av + bv, bis: ab + bb };
}
