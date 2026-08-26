// Eine Menge ist eine Zahl, eine Spanne oder ein Text. Nur die ersten beiden
// darf man multiplizieren - „nach Geschmack“ mal zwei bleibt nach Geschmack.
import { describe, it, expect } from "vitest";
import { parseMenge, zeigeMenge, skaliere, summiere, rechenbar } from "../app/menge.js";
import { parseZutat } from "../app/layout.js";
import { alsText } from "../app/schreiben.js";
import { prüfeKarte } from "../app/validate.js";
import { einkauf } from "../app/ansichten.js";

describe("Spannen", () => {
  it("liest beide Striche", () => {
    expect(parseMenge("40-60")).toEqual({ von: 40, bis: 60 });
    expect(parseMenge("40–60")).toEqual({ von: 40, bis: 60 });
  });
  it("zeigt sie mit Gedankenstrich", () => {
    expect(zeigeMenge({ von: 40, bis: 60 })).toBe("40–60");
  });
  it("skaliert beide Enden", () => {
    expect(skaliere({ von: 40, bis: 60 }, 2)).toEqual({ von: 80, bis: 120 });
    expect(skaliere({ von: 40, bis: 60 }, 0.5)).toEqual({ von: 20, bis: 30 });
  });
  it("zählt Spanne und Zahl zusammen", () => {
    expect(summiere({ von: 40, bis: 60 }, 100)).toEqual({ von: 140, bis: 160 });
    expect(summiere({ von: 40, bis: 60 }, { von: 10, bis: 20 })).toEqual({ von: 50, bis: 80 });
  });
  it("wird wieder eine Zahl, wenn beide Enden gleich sind", () => {
    expect(summiere({ von: 10, bis: 10 }, 5)).toBe(15);
  });
  it("hält einen Strich in Text für keine Spanne", () => {
    expect(parseMenge("nach-Bedarf")).toBe(null);
  });
});

describe("Mengen ohne Zahl", () => {
  it("skalieren nicht", () => {
    expect(skaliere("nach Geschmack", 2)).toBe("nach Geschmack");
  });
  it("zählen nicht mit", () => {
    expect(rechenbar("nach Geschmack")).toBe(false);
    expect(summiere("nach Geschmack", 100)).toBe(100);
  });
  it("stehen im Einkauf trotzdem da", () => {
    const zettel = einkauf({ step: { do: "x", in: ["Pfeffer: nach Geschmack"] } });
    expect(zettel[0]).toMatchObject({ name: "Pfeffer", menge: "nach Geschmack" });
  });
});

describe("Eine Zutat lesen", () => {
  const fälle = [
    ["Rosmarin: 3 Zweige", { amount: 3, unit: "Zweige", name: "Rosmarin", qual: "" }],
    ["Petersilie: 1 Handvoll", { amount: 1, unit: "Handvoll", name: "Petersilie", qual: "" }],
    ["Salz: Prise", { amount: "Prise", unit: "", name: "Salz", qual: "" }],
    ["Pfeffer: nach Geschmack", { amount: "nach Geschmack", unit: "", name: "Pfeffer", qual: "" }],
    ["Eier: 2", { amount: 2, unit: "", name: "Eier", qual: "" }],
    ["Haferflocken (grob):", { amount: null, unit: "", name: "Haferflocken", qual: "grob" }],
    ["Wasser: 40-60 g", { amount: { von: 40, bis: 60 }, unit: "g", name: "Wasser", qual: "" }],
    ["Mehl, Type 550 (gesiebt): 200 g", { amount: 200, unit: "g", name: "Mehl, Type 550", qual: "gesiebt" }]
  ];
  for (const [zeile, erwartet] of fälle)
    it(zeile, () => expect(parseZutat(zeile)).toEqual(erwartet));

  it("trennt am ersten Doppelpunkt", () => {
    expect(parseZutat("Mehl: Type 550: 200 g").name).toBe("Mehl");
  });
  it("nimmt eine Zeile ohne Doppelpunkt als reinen Namen", () => {
    expect(parseZutat("Haferflocken (grob)"))
      .toEqual({ amount: null, unit: "", name: "Haferflocken", qual: "grob" });
  });
});

describe("Zurückschreiben", () => {
  const rund = zeile => alsText(parseZutat(zeile));

  it("schreibt jede Zutat in derselben Form", () => {
    expect(rund("Dinkelmehl: 300 g")).toBe("Dinkelmehl: 300 g");
    expect(rund("Hefe (frisch): 1 Würfel")).toBe("Hefe (frisch): 1 Würfel");
    expect(rund("Rosmarin: 3 Zweige")).toBe("Rosmarin: 3 Zweige");
    expect(rund("Pfeffer: nach Geschmack")).toBe("Pfeffer: nach Geschmack");
  });
  it("lässt den Doppelpunkt weg, wenn keine Menge dasteht", () => {
    expect(rund("Haferflocken (grob)")).toBe("Haferflocken (grob)");
  });
  it("liest jede zurückgeschriebene Zeile wieder gleich", () => {
    for (const zeile of ["Dinkelmehl: 300 g", "Wasser (lauwarm): ½ l", "Rosmarin: 3 Zweige",
                         "Pfeffer: nach Geschmack", "Wasser: 40-60 g", "Eier: 2", "Salz: Prise",
                         "Haferflocken (grob)", "Mehl, Type 550 (gesiebt): 200 g"])
      expect(parseZutat(rund(zeile))).toEqual(parseZutat(zeile));
  });
});

describe("Schema", () => {
  const karte = menge => ({ schema: "rezeptkarte/1", title: "t",
    step: { do: "x", in: [{ name: "Mehl", amount: menge }] } });
  it("nimmt Zahl, Spanne, Text und null an", () => {
    for (const m of [300, { von: 40, bis: 60 }, "nach Geschmack", null])
      expect(prüfeKarte(karte(m))).toEqual([]);
  });
  it("lehnt eine halbe Spanne ab", () => {
    expect(prüfeKarte(karte({ von: 40 })).length).toBeGreaterThan(0);
  });
});
