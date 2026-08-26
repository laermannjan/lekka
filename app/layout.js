// Aus dem Rezeptbaum wird ein Raster: Zeilen sind Zutatenverwendungen,
// Spalten sind Zeitpunkte.
import { parseMenge } from "./menge.js";

const KLAMMER = /^(.*?)\s*\(([^()]*)\)\s*$/;

// Eine Zutat: "Name (Zusatz): Menge Einheit". Alles vor dem ersten Doppelpunkt
// benennt, alles danach misst. Rechts ist die führende Zahl oder Spanne die
// Menge und der Rest die Einheit; steht dort keine Zahl, ist alles zusammen die
// Menge. Damit braucht es keine Liste bekannter Einheiten: "3 Zweige",
// "1 Handvoll" und "nach Geschmack" ergeben sich aus derselben Regel.
export function parseZutat(zutat) {
  if (typeof zutat !== "string") {
    return { amount: zutat.amount ?? null, unit: zutat.unit ?? "",
             name: zutat.name, qual: zutat.qual ?? "" };
  }
  const doppelpunkt = zutat.indexOf(":");
  const k = KLAMMER.exec((doppelpunkt < 0 ? zutat : zutat.slice(0, doppelpunkt)).trim());
  const name = (k ? k[1] : (doppelpunkt < 0 ? zutat : zutat.slice(0, doppelpunkt))).trim();
  const qual = k ? k[2].trim() : "";

  const teile = (doppelpunkt < 0 ? "" : zutat.slice(doppelpunkt + 1)).trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return { amount: null, unit: "", name, qual };
  const menge = parseMenge(teile[0]);
  return menge === null
    ? { amount: teile.join(" "), unit: "", name, qual }
    : { amount: menge, unit: teile.slice(1).join(" "), name, qual };
}

const istSchritt = knoten => typeof knoten === "object" && knoten !== null && "do" in knoten;

// Postorder. Die Spalte eines Schritts ergibt sich aus seinem tiefsten Kind;
// die übrigen Kinder rücken so weit nach rechts, dass sie direkt vor der
// Zusammenführung stehen. Eine Spalte sagt damit, wann man etwas tut, nicht
// wann man es frühestens könnte: die Form fettet man vor dem Einfüllen, nicht
// zu Beginn. Verschoben wird immer der ganze Teilbaum, und weil jeder Strang
// seine eigenen Zeilen hat, kann dabei nichts kollidieren.
function begehen(knoten, rows, cells, herkunft, eltern = null, index = -1) {
  if (!istSchritt(knoten)) {
    rows.push(parseZutat(knoten));
    herkunft.zutaten.push({ eltern, index });
    return { row: rows.length - 1, span: 1, col: 0, zellen: [] };
  }
  const kinder = knoten.in.map((kind, i) => begehen(kind, rows, cells, herkunft, knoten, i));
  const row = Math.min(...kinder.map(k => k.row));
  const span = Math.max(...kinder.map(k => k.row + k.span)) - row;
  const col = Math.max(...kinder.map(k => k.col)) + 1;

  for (const kind of kinder) {
    const abstand = col - 1 - kind.col;
    if (abstand > 0) for (const i of kind.zellen) cells[i].col += abstand;
  }

  const k = KLAMMER.exec(knoten.do.trim());
  cells.push({ col, row, span, colspan: 1,
    text: k ? k[1] : knoten.do.trim(),
    note: knoten.note ?? (k ? k[2].trim() : "") });
  herkunft.schritte.push({ knoten, eltern, index });
  return { row, span, col, zellen: [...kinder.flatMap(k => k.zellen), cells.length - 1] };
}

// herkunft liegt neben rows und cells statt in ihnen: das Raster bleibt reine
// Zahlen und Text, vergleichbar und ohne Verweise auf den halben Baum. Wer
// zurückschreiben will, nimmt denselben Index.
//   herkunft.zutaten[i] = { eltern, index }  zu rows[i]
//   herkunft.schritte[i] = { knoten, eltern, index }  zu cells[i]
export function layout(rezept) {
  const rows = [], cells = [];
  const herkunft = { zutaten: [], schritte: [] };
  begehen(rezept.step, rows, cells, herkunft);
  return { rows, cells, tree: rezept, herkunft };
}

// Darf die Kante einer Zelle den Nachbarn schlucken? Nur Geschwister
// verschmelzen, über den Elternknoten hinweg gäbe es keinen gültigen Baum.
export function canAbsorb(parent, kind, richtung) {
  const i = parent.in.indexOf(kind);
  if (i < 0) return false;
  return richtung === "up" ? i > 0 : i < parent.in.length - 1;
}
