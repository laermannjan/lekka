import { describe, it, expect } from "vitest";
import { layout, canAbsorb } from "../app/layout.js";

const dinkelquarkbrot = {
  schema: "rezeptkarte/1", title: "Dinkelquarkbrot", yield: "1 Kastenbrot",
  prep: ["Kastenform 30 cm einfetten"],
  step: { do: "backen 200 °C Heißluft 60 min", note: "ohne Vorheizen, unterste Schiene",
    in: [{ do: "in Form geben",
      in: [
        { do: "vermengen", note: "von Hand, Teig bleibt weich",
          in: ["Dinkelmehl: 300 g", "Dinkelschrot: 300 g", "Körner (z. B. Sonnenblumen): 100 g",
               "Salz: 2 TL", "Honig: 1 TL", "Hefe (frisch): 1 Würfel",
               "Magerquark (oder Naturjoghurt): 75 g", "Wasser (lauwarm): ½ l"] },
        { do: "ausstreuen", note: "in die gefettete Form",
          in: [{ amount: null, unit: "", name: "Haferflocken", qual: "grob" }] }
      ] }] }
};

const erdkruste = {
  schema: "rezeptkarte/1", title: "Erdkruste",
  step: { do: "auskühlen lassen", in: [{ do: "backen 210 °C 70–75 min", in: [
    { do: "gehen lassen 100–120 min", in: [{ do: "rund wirken", in: [
      { do: "ruhen lassen 30 min", in: [{ do: "verrühren", note: "Flexi-Rührer", in: [
        { do: "reifen lassen 12 h (bei 20 °C)", in: [
          { do: "verrühren", in: [
            { do: "aufschlämmen", in: ["Anstellgut (reif): 50 g", "Wasser (ca. 50 °C): 285 g"] },
            "Roggenvollkornmehl: 250 g", "Salz: 5 g"] }] },
        "Wasser (ca. 70 °C): 250 g", "Roggenvollkornmehl: 355 g", "Salz: 8 g"] }] }] }] }] }] }
};

describe("Dinkelquarkbrot", () => {
  const out = layout(dinkelquarkbrot);
  it("legt die Zutaten in Tiefensuche-Reihenfolge ab", () => {
    expect(out.rows.map(r => r.name)).toEqual(["Dinkelmehl","Dinkelschrot","Körner","Salz",
      "Honig","Hefe","Magerquark","Wasser","Haferflocken"]);
  });
  it("parst Menge, Einheit und Klammerzusatz", () => {
    expect(out.rows[2]).toEqual({ amount:100, unit:"g", name:"Körner", qual:"z. B. Sonnenblumen" });
    expect(out.rows[7]).toEqual({ amount:0.5, unit:"l", name:"Wasser", qual:"lauwarm" });
  });
  it("reproduziert das Raster der bestehenden Karte", () => {
    expect(out.cells).toEqual([
      { col:1, row:0, span:8, colspan:1, text:"vermengen", note:"von Hand, Teig bleibt weich" },
      { col:1, row:8, span:1, colspan:1, text:"ausstreuen", note:"in die gefettete Form" },
      { col:2, row:0, span:9, colspan:1, text:"in Form geben", note:"" },
      { col:3, row:0, span:9, colspan:1, text:"backen 200 °C Heißluft 60 min",
        note:"ohne Vorheizen, unterste Schiene" }
    ]);
  });
});

describe("Erdkruste", () => {
  const out = layout(erdkruste);
  it("trennt Vorteig- und Hauptteigstrang", () => {
    expect(out.rows.map(r => r.name)).toEqual(["Anstellgut","Wasser","Roggenvollkornmehl","Salz",
      "Wasser","Roggenvollkornmehl","Salz"]);
  });
  it("setzt jeden Schritt so weit links wie möglich", () => {
    expect(out.cells.map(c => [c.col, c.row, c.span, c.text])).toEqual([
      [1,0,2,"aufschlämmen"], [2,0,4,"verrühren"], [3,0,4,"reifen lassen 12 h"],
      [4,0,7,"verrühren"], [5,0,7,"ruhen lassen 30 min"], [6,0,7,"rund wirken"],
      [7,0,7,"gehen lassen 100–120 min"], [8,0,7,"backen 210 °C 70–75 min"],
      [9,0,7,"auskühlen lassen"]
    ]);
  });
  it("lässt die drei Hauptteigzeilen vor Spalte 4 frei", () => {
    const belegt = (c,r) => out.cells.some(x => x.col===c && r>=x.row && r<x.row+x.span);
    for (const r of [4,5,6]) for (const c of [1,2,3]) expect(belegt(c,r)).toBe(false);
    for (const r of [4,5,6]) expect(belegt(4,r)).toBe(true);
  });
});

describe("Invarianten", () => {
  for (const [name, rezept] of [["Dinkelquarkbrot", dinkelquarkbrot], ["Erdkruste", erdkruste]]) {
    it(`${name}: keine Zelle überlappt eine andere`, () => {
      const { cells } = layout(rezept), belegt = new Set();
      for (const c of cells) for (let r=c.row; r<c.row+c.span; r++) {
        const k = `${c.col}|${r}`;
        expect(belegt.has(k)).toBe(false);
        belegt.add(k);
      }
    });
    it(`${name}: jede Spanne ist zusammenhängend und im Raster`, () => {
      const { rows, cells } = layout(rezept);
      for (const c of cells) {
        expect(c.span).toBeGreaterThan(0);
        expect(c.row).toBeGreaterThanOrEqual(0);
        expect(c.row + c.span).toBeLessThanOrEqual(rows.length);
      }
    });
  }
});

describe("Klammern", () => {
  it("liest den Zusatz aus der Klammer, auch wenn der Name ein Komma enthält", () => {
    const { rows } = layout({ title:"t", step:{ do:"x", in:["Mehl, Type 550 (gesiebt): 200 g"] } });
    expect(rows[0]).toEqual({ amount:200, unit:"g", name:"Mehl, Type 550", qual:"gesiebt" });
  });
  it("liest den Hinweis aus der Klammer am Schritt", () => {
    const { cells } = layout({ title:"t", step:{ do:"reifen lassen 12 h (bei 20 °C)", in:["Anstellgut: 50 g"] } });
    expect(cells[0].text).toBe("reifen lassen 12 h");
    expect(cells[0].note).toBe("bei 20 °C");
  });
  it("lässt ein eigenes note-Feld gewinnen", () => {
    const { cells } = layout({ title:"t", step:{ do:"backen (250 °C)", note:"mit Dampf", in:["Teig: 1 Stk"] } });
    expect(cells[0].note).toBe("mit Dampf");
  });
  it("kommt ohne Klammer und ohne Menge aus", () => {
    const { rows } = layout({ title:"t", step:{ do:"x", in:["Haferflocken"] } });
    expect(rows[0]).toEqual({ amount:null, unit:"", name:"Haferflocken", qual:"" });
  });
});

describe("Kantenregler", () => {
  const parent = { do: "x", in: ["a", "b", "c"] };
  it("erlaubt nur Geschwister", () => {
    expect(canAbsorb(parent, "a", "up")).toBe(false);
    expect(canAbsorb(parent, "a", "down")).toBe(true);
    expect(canAbsorb(parent, "c", "up")).toBe(true);
  });
});

describe("Rechtsbündige Nebenstränge", () => {
  // Ein Strang ohne Vorbedingung soll dort stehen, wo er gebraucht wird.
  const spätesEinfetten = {
    schema: "rezeptkarte/1", title: "t",
    step: { do: "in Form geben", in: [
      { do: "gehen lassen", in: [{ do: "vermengen", in: ["Mehl: 300 g"] }] },
      { do: "einfetten, ausstreuen", in: ["Haferflocken"] }] }
  };

  it("schiebt den kurzen Strang direkt vor die Zusammenführung", () => {
    const { cells } = layout(spätesEinfetten);
    const einfetten = cells.find(c => c.text.startsWith("einfetten"));
    const zusammen = cells.find(c => c.text === "in Form geben");
    expect(einfetten.col).toBe(zusammen.col - 1);
  });
  it("lässt den längsten Strang, wo er ist", () => {
    const { cells } = layout(spätesEinfetten);
    expect(cells.find(c => c.text === "vermengen").col).toBe(1);
    expect(cells.find(c => c.text === "gehen lassen").col).toBe(2);
  });
  it("verschiebt eine ganze Kette am Stück", () => {
    const { cells } = layout({ schema: "rezeptkarte/1", title: "t",
      step: { do: "zusammen", in: [
        { do: "a3", in: [{ do: "a2", in: [{ do: "a1", in: ["x: 1 g"] }] }] },
        { do: "b2", in: [{ do: "b1", in: ["y: 2 g"] }] }] } });
    const spalte = t => cells.find(c => c.text === t).col;
    expect([spalte("a1"), spalte("a2"), spalte("a3")]).toEqual([1, 2, 3]);
    expect([spalte("b1"), spalte("b2")]).toEqual([2, 3]);
    expect(spalte("zusammen")).toBe(4);
  });
  it("lässt keine Zelle überlappen", () => {
    const { cells } = layout(spätesEinfetten);
    const belegt = new Set();
    for (const c of cells) for (let r = c.row; r < c.row + c.span; r++) {
      expect(belegt.has(`${c.col}|${r}`)).toBe(false);
      belegt.add(`${c.col}|${r}`);
    }
  });
});
