// Zeichnet die Karte: Bänder für Anmerkungen und Vorbereitung, darunter das
// Raster aus layout(). Die Linien kommen aus den Fugen des Grids, nicht aus
// Rahmen an den Zellen, damit jede Linie genau einmal entsteht.
import { layout } from "./layout.js";
import { skaliere, zeigeMenge } from "./menge.js";

const kasten = (klasse, ...kinder) => {
  const d = document.createElement("div");
  d.className = klasse;
  for (const k of kinder) if (k) d.append(k);
  return d;
};

export function render(rezept, ziel, faktor = 1) {
  const { rows, cells } = layout(rezept);
  const spalten = Math.max(1, ...cells.map(c => c.col));
  const vorbereitung = rezept.prep ?? [];
  // Zeile 1..P Vorbereitung, dann die Spaltenköpfe, dann die Zutaten.
  const versatz = vorbereitung.length + 2;

  ziel.textContent = "";
  const raster = kasten("raster");
  raster.style.setProperty("--spalten", spalten);
  ziel.append(raster);

  vorbereitung.forEach((text, i) => {
    const zeile = kasten("prep", document.createTextNode(text));
    zeile.dataset.feld = "prep";
    zeile.dataset.stelle = i;
    // Über die volle Breite, damit sie beim Querscrollen mitläuft.
    zeile.style.gridColumn = "1 / -1";
    zeile.style.gridRow = i + 1;
    raster.append(zeile);
  });

  const kopf = (text, spalte) => {
    const d = kasten("spaltenkopf", document.createTextNode(text));
    d.style.gridColumn = spalte;
    d.style.gridRow = vorbereitung.length + 1;
    raster.append(d);
  };
  kopf("Zutaten", 1);
  for (let c = 1; c <= spalten; c++) kopf(String(c).padStart(2, "0"), c + 1);

  // Menge und Einheit stehen auch leer da: sonst rutscht der Name in ihre
  // Spalte und die Zutaten fluchten nicht mehr.
  const spalte = (klasse, text, zeile) => {
    const s = document.createElement("span");
    s.className = klasse;
    s.textContent = text;
    s.dataset.feld = klasse;
    s.dataset.zeile = zeile;
    return s;
  };

  rows.forEach((r, i) => {
    const menge = spalte("menge", zeigeMenge(skaliere(r.amount, faktor)), i);
    // „nach Geschmack“ passt in keine Zahlenspalte und rechnet auch nicht mit.
    // Es nimmt beide Spalten ein; eine leere Einheitenzelle daneben würde mit
    // ihm kollidieren und den Namen in die nächste Zeile schieben.
    const textmenge = typeof r.amount === "string";
    if (textmenge) menge.classList.add("text");
    const zutat = kasten("zutat", menge,
      textmenge ? null : spalte("einheit", r.unit, i),
      kasten("benennung", spalte("name", r.name, i), spalte("qual", r.qual, i)));
    zutat.style.gridRow = versatz + i;
    zutat.style.gridColumn = 1;
    raster.append(zutat);
  });

  const belegt = new Set();
  cells.forEach((c, i) => {
    const verb = spalte("verb", c.text, i);
    const hinweis = spalte("hinweis", c.note, i);
    verb.dataset.zelle = i;
    hinweis.dataset.zelle = i;
    const zelle = kasten("zelle", verb, hinweis);
    zelle.style.gridArea = `${c.row + versatz} / ${c.col + 1} / span ${c.span} / span ${c.colspan}`;
    raster.append(zelle);
    for (let r = c.row; r < c.row + c.span; r++)
      for (let x = c.col; x < c.col + c.colspan; x++) belegt.add(`${x}|${r}`);
  });

  for (const f of freieFlächen(belegt, rows.length, spalten)) {
    const leer = kasten("leer");
    leer.style.gridArea = `${f.row + versatz} / ${f.col + 1} / span ${f.span} / span ${f.colspan}`;
    // Nimmt der Schritt rechts daneben genau diese Zeilen auf, gehört die
    // Fläche zu seinem Eingang und die Fuge dazwischen entfällt.
    if (cells.some(c => c.col === f.col + f.colspan && c.row <= f.row && c.row + c.span >= f.row + f.span))
      leer.classList.add("fliesst");
    raster.append(leer);
  }
}

// Freie Felder werden zu Rechtecken zusammengefasst, wie die Vorlage es mit
// rowspan und colspan tut. Ein Rechteck wächst nur nach unten, solange die
// freie Strecke dieselbe bleibt; sonst verschluckt es Zeilengrenzen, die
// links und rechts davon sichtbar sind.
export function freieFlächen(belegt, zeilen, spalten) {
  const frei = new Set();
  for (let r = 0; r < zeilen; r++)
    for (let s = 1; s <= spalten; s++)
      if (!belegt.has(`${s}|${r}`)) frei.add(`${s}|${r}`);

  const gleicheStrecke = (r, s, breite) => {
    if (frei.has(`${s - 1}|${r}`) || frei.has(`${s + breite}|${r}`)) return false;
    for (let x = s; x < s + breite; x++) if (!frei.has(`${x}|${r}`)) return false;
    return true;
  };

  const flächen = [];
  for (let r = 0; r < zeilen; r++)
    for (let s = 1; s <= spalten; s++) {
      if (!frei.has(`${s}|${r}`)) continue;
      let colspan = 0;
      while (frei.has(`${s + colspan}|${r}`)) colspan++;
      let span = 1;
      while (gleicheStrecke(r + span, s, colspan)) span++;
      for (let y = r; y < r + span; y++)
        for (let x = s; x < s + colspan; x++) frei.delete(`${x}|${y}`);
      flächen.push({ row: r, col: s, span, colspan });
    }
  return flächen;
}
