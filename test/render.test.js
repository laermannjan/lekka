// @vitest-environment jsdom
// Felder, die die Karte mitbringt, dürfen beim Zeichnen nicht verschwinden.
import { describe, it, expect, beforeEach } from "vitest";
import { render, freieFlächen } from "../app/render.js";
import { layout } from "../app/layout.js";

const karte = {
  schema: "rezeptkarte/1", title: "Roggenquarkbrot", yield: "1 Kastenbrot",
  meta: ["Vorteig am Vorabend", "Salzsauerführung"],
  prep: ["Kastenform 30 cm einfetten"],
  step: { do: "backen", note: "unterste Schiene",
    in: ["Roggenvollkornmehl: 300 g", { name: "Haferflocken", qual: "grob", amount: null, unit: "" }] }
};

let ziel;
beforeEach(() => {
  document.body.innerHTML = '<div id="karte"></div>';
  ziel = document.querySelector("#karte");
  render(karte, ziel);
});

// Die Felder einer Zeile sind eigene Spans, der Abstand kommt aus dem CSS.
// Deshalb hier zusammensetzen statt textContent zu vergleichen.
const texte = wahl => [...ziel.querySelectorAll(wahl)]
  .map(e => [...e.childNodes].map(k => k.textContent).join(" ").trim());

describe("Zeichnen", () => {
  it("zeichnet meta nicht ins Raster", () => {
    // meta gilt für die ganze Karte und steht in der Kopfzeile, nicht als Schritt.
    expect(texte(".meta")).toEqual([]);
  });
  it("zeigt jede Vorbereitung", () => {
    expect(texte(".prep")).toEqual(["Kastenform 30 cm einfetten"]);
  });
  it("zeigt jede Zutat mit Menge, Einheit und Zusatz", () => {
    const zutaten = [...ziel.querySelectorAll(".zutat")].map(z => ({
      menge: z.querySelector(".menge")?.textContent ?? "",
      einheit: z.querySelector(".einheit")?.textContent ?? "",
      name: z.querySelector(".name")?.textContent ?? "",
      qual: z.querySelector(".qual")?.textContent ?? ""
    }));
    expect(zutaten).toEqual([
      { menge: "300", einheit: "g", name: "Roggenvollkornmehl", qual: "" },
      { menge: "", einheit: "", name: "Haferflocken", qual: "grob" }
    ]);
  });
  it("rechnet die Mengen mit dem Faktor", () => {
    render(karte, ziel, 2);
    expect(ziel.querySelector(".zutat .menge").textContent).toBe("600");
  });
  it("lässt eine Zutat ohne Menge auch beim Skalieren ohne Menge", () => {
    render(karte, ziel, 2);
    const ohne = [...ziel.querySelectorAll(".zutat")][1];
    expect(ohne.querySelector(".menge").textContent).toBe("");
  });
  it("hält die Spalten für Menge und Einheit frei, auch wenn nichts drinsteht", () => {
    // Sonst rutscht der Name in die Mengenspalte und die Zutaten fluchten nicht.
    for (const zutat of ziel.querySelectorAll(".zutat"))
      expect([...zutat.children].map(k => k.className)).toEqual(["menge", "einheit", "benennung"]);
  });
  it("zeigt Verb und Hinweis", () => {
    expect(texte(".zelle")).toEqual(["backen unterste Schiene"]);
  });
  it("beschriftet die Spalten", () => {
    expect(texte(".spaltenkopf")).toEqual(["Zutaten", "01"]);
  });
  it("beginnt beim erneuten Zeichnen von vorn", () => {
    render(karte, ziel);
    render(karte, ziel);
    expect(texte(".prep")).toEqual(["Kastenform 30 cm einfetten"]);
    expect(ziel.querySelectorAll(".raster")).toHaveLength(1);
  });
  it("gibt jedem Feld eine Adresse", () => {
    const erste = ziel.querySelector('.zutat .name');
    expect(erste.dataset.zeile).toBe("0");
    expect(ziel.querySelector(".zelle .verb").dataset.zelle).toBe("0");
    expect(ziel.querySelector(".prep").dataset.stelle).toBe("0");
  });
  it("kommt ohne meta und prep aus", () => {
    const { meta, prep, ...ohne } = karte;
    render(ohne, ziel);
    expect(texte(".meta")).toEqual([]);
    expect(texte(".prep")).toEqual([]);
    expect(texte(".zutat")).toHaveLength(2);
  });
});

describe("Raster", () => {
  // Ein Nebenstrang endet früh. Die Fläche darunter gehört zum Eingang des
  // Schritts rechts daneben, muss also ein Rechteck sein und keine Kette
  // einzelner Felder, sonst steht dort ein Gitter.
  const zweiStränge = {
    schema: "rezeptkarte/1", title: "t",
    step: { do: "zusammen", in: [
      { do: "lang", in: [{ do: "vorher", in: ["a: 1 g"] }] },
      "b: 2 g"] }
  };

  const flächen = () => [...ziel.querySelectorAll(".leer")].map(e => e.style.gridArea);

  it("fasst die freie Fläche zu einem Rechteck zusammen", () => {
    render(zweiStränge, ziel);
    // Zeile 2 der Zutaten, Spalten 1 und 2 frei
    expect(flächen()).toEqual(["3 / 2 / span 1 / span 2"]);
  });
  it("legt kein Rechteck an, wo jeder Schritt über alles spannt", () => {
    render({ schema: "rezeptkarte/1", title: "t", step: { do: "x", in: ["a: 1 g", "b: 2 g"] } }, ziel);
    expect(flächen()).toEqual([]);
  });
  it("deckt zusammen mit den Zellen jedes Feld genau einmal ab", () => {
    render(zweiStränge, ziel);
    const { rows, cells } = layout(zweiStränge);
    const spalten = Math.max(...cells.map(c => c.col));
    const ausZellen = cells.reduce((s, c) => s + c.span * c.colspan, 0);
    const ausFlächen = flächen().reduce((s, f) => {
      const [, , span, colspan] = f.match(/(\d+) \/ (\d+) \/ span (\d+) \/ span (\d+)/).slice(1).map(Number);
      return s + span * colspan;
    }, 0);
    expect(ausZellen + ausFlächen).toBe(rows.length * spalten);
  });
  it("wächst über mehrere Zeilen, wenn die Fläche hoch ist", () => {
    render({ schema: "rezeptkarte/1", title: "t",
      step: { do: "zusammen", in: [
        { do: "lang", in: [{ do: "vorher", in: ["a: 1 g"] }] },
        "b: 2 g", "c: 3 g", "d: 4 g"] } }, ziel);
    expect(flächen()).toEqual(["3 / 2 / span 3 / span 2"]);
  });
});

describe("Aufteilung der freien Fläche", () => {
  // Nachgerechnet an der Karte "Southern Buttermilk Biscuits" von
  // cookingforengineers.com: 7 Zutatenzeilen, 10 Schrittspalten, die Schritte
  // spannen 4, 6 und siebenmal 7 Zeilen. Deren Markup setzt dort genau zwei
  // leere Zellen, rowspan=2 und colspan=2.
  const vorlage = () => {
    const belegt = new Set();
    [4, 6, 7, 7, 7, 7, 7, 7, 7, 7].forEach((höhe, i) => {
      for (let r = 0; r < höhe; r++) belegt.add(`${i + 1}|${r}`);
    });
    return freieFlächen(belegt, 7, 10);
  };

  it("teilt wie die Vorlage auf", () => {
    expect(vorlage()).toEqual([
      { row: 4, col: 1, span: 2, colspan: 1 },
      { row: 6, col: 1, span: 1, colspan: 2 }
    ]);
  });

  it("hört auf zu wachsen, wenn die freie Strecke breiter wird", () => {
    // Sonst verschluckt das Rechteck die Zeilengrenze, die links und rechts
    // davon sichtbar ist, und die Trennlinie hört mitten in der Karte auf.
    const [oben, unten] = vorlage();
    expect(oben.row + oben.span).toBe(unten.row);
    expect(unten.colspan).toBeGreaterThan(oben.colspan);
  });

  it("lässt keine Lücke und keine Überdeckung", () => {
    const belegt = new Set();
    [4, 6, 7, 7, 7, 7, 7, 7, 7, 7].forEach((höhe, i) => {
      for (let r = 0; r < höhe; r++) belegt.add(`${i + 1}|${r}`);
    });
    const gesehen = new Set();
    for (const f of freieFlächen(belegt, 7, 10))
      for (let r = f.row; r < f.row + f.span; r++)
        for (let s = f.col; s < f.col + f.colspan; s++) {
          expect(belegt.has(`${s}|${r}`)).toBe(false);
          expect(gesehen.has(`${s}|${r}`)).toBe(false);
          gesehen.add(`${s}|${r}`);
        }
    expect(gesehen.size).toBe(7 * 10 - belegt.size);
  });
});
