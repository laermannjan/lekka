// Karte als verschachtelte Liste. Keine eigene Sprache: eine Markdown-Liste,
// in der die Verschachtelung genau die des Baums ist. Ein Punkt mit
// eingerückten Punkten darunter ist ein Schritt, ein Punkt ohne ist eine
// Zutat - mehr unterscheidet die beiden nicht.
//
//   # Titel | Ertrag
//   > Anmerkung
//   * Vorbereitung
//   - backen 200 °C | ohne Vorheizen
//     - vermengen
//       - 300 g Mehl
//
// Die Wurzel steht oben, also der letzte Schritt zuerst. Das ist die Ordnung
// des Baums; chronologisch liest man die Ansicht „Ablauf" oder die Karte.

const istSchritt = k => typeof k === "object" && k !== null && "do" in k;
const einzug = z => z.length - z.trimStart().length;
const kopf = k => k.do + (k.note ? ` | ${k.note}` : "");

// Objektzutaten haben Felder, die eine Textzeile nicht trägt. Solche Karten
// bleiben beim JSON, statt sie beim Speichern still umzuschreiben.
export function verlustfrei(karte) {
  return (function prüfe(knoten) {
    if (!istSchritt(knoten)) return typeof knoten === "string";
    return knoten.in.every(prüfe);
  })(karte.step);
}

export function schreibe(karte) {
  const aus = [];
  aus.push(`# ${karte.title}${karte.yield ? ` | ${karte.yield}` : ""}`);
  for (const m of karte.meta ?? []) aus.push(`> ${m}`);
  for (const p of karte.prep ?? []) aus.push(`* ${p}`);
  if (aus.length > 1) aus.push("");

  (function gehe(knoten, ind) {
    aus.push(`${" ".repeat(ind)}- ${istSchritt(knoten) ? kopf(knoten) : knoten}`);
    if (istSchritt(knoten)) for (const kind of knoten.in) gehe(kind, ind + 2);
  })(karte.step, 0);

  return aus.join("\n") + "\n";
}

const trenne = text => {
  const [, links, rechts] = /^([^|]*?)(?:\s*\|\s*(.*))?$/.exec(text.trim());
  return { links, rechts };
};

export function lies(text) {
  const alle = text.split("\n");
  const karte = { schema: "rezeptkarte/1", title: "" };
  const zeilen = [];   // { nummer, ind, inhalt } nur die Baumzeilen

  alle.forEach((roh, i) => {
    const zeile = roh.replace(/\s+$/, "");
    if (!zeile.trim()) return;
    const inhalt = zeile.trim();
    if (inhalt.startsWith("# ")) {
      const { links, rechts } = trenne(inhalt.slice(2));
      karte.title = links;
      if (rechts !== undefined) karte.yield = rechts;
    } else if (inhalt.startsWith("> ")) {
      (karte.meta ??= []).push(inhalt.slice(2).trim());
    } else if (inhalt.startsWith("* ")) {
      (karte.prep ??= []).push(inhalt.slice(2).trim());
    } else if (inhalt.startsWith("- ")) {
      zeilen.push({ nummer: i + 1, ind: einzug(zeile), inhalt: inhalt.slice(2).trim() });
    } else {
      throw new Error(`Zeile ${i + 1}: fängt mit keinem der Zeichen # > * - an`);
    }
  });

  if (!karte.title) throw new Error("Es fehlt eine Titelzeile, die mit # anfängt");
  if (zeilen.length === 0) throw new Error("Es fehlt der Baum: eine Zeile, die mit - anfängt");

  let i = 0;
  function knoten() {
    const { ind, inhalt, nummer } = zeilen[i];
    i++;
    const kinder = [];
    while (i < zeilen.length && zeilen[i].ind > ind) {
      if (kinder.length === 0 && zeilen[i].ind !== ind + 2 && zeilen[i].ind <= ind)
        throw new Error(`Zeile ${zeilen[i].nummer}: Einrückung passt zu keinem Schritt`);
      kinder.push(knoten());
    }
    if (kinder.length === 0) return inhalt;
    const { links, rechts } = trenne(inhalt);
    if (!links) throw new Error(`Zeile ${nummer}: Schritt ohne Verb`);
    return rechts === undefined ? { do: links, in: kinder } : { do: links, note: rechts, in: kinder };
  }

  karte.step = knoten();
  if (i < zeilen.length)
    throw new Error(`Zeile ${zeilen[i].nummer}: zweite Wurzel, es gibt nur einen letzten Schritt`);
  if (typeof karte.step === "string")
    throw new Error("Zeile 1 des Baums ist eine Zutat, kein Schritt");
  return karte;
}
