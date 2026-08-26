// Zählt, was sich gegenüber der geladenen Karte geändert hat. Der Zähler ist
// die einzige Rückmeldung, dass ungespeicherte Arbeit dasteht, deshalb zählt
// er Felder und nicht Tastendrücke.
import { parseZutat } from "./layout.js";

const istSchritt = k => typeof k === "object" && k !== null && "do" in k;

export function änderungen(alt, neu) {
  let n = 0;
  const wort = (a, b) => { if ((a ?? "") !== (b ?? "")) n++; };

  wort(alt.title, neu.title);
  wort(alt.yield, neu.yield);

  for (const feld of ["meta", "prep"]) {
    const a = alt[feld] ?? [], b = neu[feld] ?? [];
    if (a.length !== b.length) n++;
    for (let i = 0; i < Math.min(a.length, b.length); i++) wort(a[i], b[i]);
  }

  (function vergleiche(a, b) {
    if (istSchritt(a) !== istSchritt(b)) return void n++;
    if (!istSchritt(a)) {
      const x = parseZutat(a), y = parseZutat(b);
      for (const feld of ["amount", "unit", "name", "qual"])
        if ((x[feld] ?? "") !== (y[feld] ?? "")) n++;
      return;
    }
    wort(a.do, b.do);
    wort(a.note, b.note);
    if (a.in.length !== b.in.length) return void n++;
    for (let i = 0; i < a.in.length; i++) vergleiche(a.in[i], b.in[i]);
  })(alt.step, neu.step);

  return n;
}

export const beschreibe = n =>
  n === 0 ? "" : n === 1 ? "1 Änderung" : `${n} Änderungen`;
