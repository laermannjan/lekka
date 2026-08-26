// Die Notation ist eine zweite Fassung derselben Karte. Geht beim Hin und Her
// etwas verloren, zerschießt der Editor beim Speichern eine Datei, die jemand
// von Hand geschrieben hat.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { schreibe, lies, verlustfrei } from "../app/notation.js";
import { prüfeKarte } from "../app/validate.js";
import { layout } from "../app/layout.js";

const ordne = w => Array.isArray(w) ? w.map(ordne)
  : (w && typeof w === "object")
    ? Object.fromEntries(Object.keys(w).sort().map(s => [s, ordne(w[s])])) : w;

describe("Karten im Repo", () => {
  for (const datei of readdirSync("rezepte").filter(d => d.endsWith(".json"))) {
    const karte = JSON.parse(readFileSync(`rezepte/${datei}`, "utf8"));

    describe(karte.title, () => {
      it("kommt unverändert zurück", () => {
        expect(ordne(lies(schreibe(karte)))).toEqual(ordne(karte));
      });
      it("ergibt denselben Text, wenn man sie zweimal schreibt", () => {
        expect(schreibe(lies(schreibe(karte)))).toBe(schreibe(karte));
      });
      it("bleibt gültig", () => {
        expect(prüfeKarte(lies(schreibe(karte)))).toEqual([]);
      });
      it("ergibt dasselbe Raster", () => {
        expect(layout(lies(schreibe(karte))).cells).toEqual(layout(karte).cells);
      });
    });
  }
});

describe("Zufällige Bäume", () => {
  // Fester Startwert: derselbe Lauf bei jedem Test, aber 2000 Formen statt der
  // drei, die wir zufällig im Repo haben.
  let saat = 20260823;
  const zufall = () => (saat = (saat * 1103515245 + 12345) % 2147483648) / 2147483648;
  const wähle = n => Math.floor(zufall() * n);
  let zähler = 0;
  const baum = tiefe => {
    const kinder = [];
    for (let i = 0, n = 1 + wähle(5); i < n; i++)
      kinder.push(tiefe > 0 && zufall() < 0.45 ? baum(tiefe - 1) : `${1 + wähle(500)} g zutat${zähler++}`);
    return { do: `schritt${zähler++}`, in: kinder };
  };

  it("laufen alle verlustfrei hin und zurück", () => {
    const kaputt = [];
    for (let n = 0; n < 2000; n++) {
      zähler = 0;
      const karte = { schema: "rezeptkarte/1", title: "t", step: baum(1 + wähle(6)) };
      try {
        if (JSON.stringify(ordne(lies(schreibe(karte)))) !== JSON.stringify(ordne(karte)))
          kaputt.push({ karte, text: schreibe(karte) });
      } catch (fehler) {
        kaputt.push({ karte, grund: fehler.message });
      }
    }
    expect(kaputt.slice(0, 1)).toEqual([]);
  });
});

describe("Was die Notation nicht kann", () => {
  it("erkennt eine Karte mit Objektzutaten als verlustbehaftet", () => {
    // Ein Objekt kann Felder tragen, die keine Textzeile hat.
    expect(verlustfrei({ step: { do: "x", in: [{ name: "Mehl", herkunft: "Hofladen" }] } })).toBe(false);
  });
  it("erkennt eine Karte aus lauter Textzutaten als verlustfrei", () => {
    expect(verlustfrei({ step: { do: "x", in: ["Mehl: 300 g"] } })).toBe(true);
  });
});

describe("Fehler benennen ihre Zeile", () => {
  const scheitert = (text, teil) => {
    expect(() => lies(text)).toThrowError(new RegExp(teil));
  };
  it("ohne Titel", () => scheitert("- backen\n  - 1 g Salz", "Titelzeile"));
  it("ohne Baum", () => scheitert("# Brot", "fehlt der Baum"));
  it("bei unbekanntem Zeilenanfang", () => scheitert("# Brot\nbacken", "Zeile 2"));
  it("bei zwei Wurzeln", () => scheitert("# Brot\n- backen\n  - 1 g Salz\n- rühren\n  - 2 g Salz", "zweite Wurzel"));
  it("wenn die Wurzel eine Zutat ist", () => scheitert("# Brot\n- 300 g Mehl", "keine? *Schritt|Zutat"));
});

describe("Kopfzeilen", () => {
  const text = "# Brot | 1 Laib\n> zwei Tage\n> 88 % Hydration\n* Ofen vorheizen\n\n- backen\n  - 1 g Salz\n";
  it("liest Titel und Ertrag", () => {
    expect(lies(text)).toMatchObject({ title: "Brot", yield: "1 Laib" });
  });
  it("liest jede Anmerkung und jede Vorbereitung", () => {
    expect(lies(text).meta).toEqual(["zwei Tage", "88 % Hydration"]);
    expect(lies(text).prep).toEqual(["Ofen vorheizen"]);
  });
  it("kommt ohne Ertrag aus", () => {
    expect("yield" in lies("# Brot\n- backen\n  - 1 g Salz")).toBe(false);
  });
});
