// Ablauf und Einkauf lesen dieselbe Karte anders. Beide gehen über den Baum,
// damit „was fließt in diesen Schritt" das Rezept beantwortet und nicht die
// Zeilenspanne im Raster.
import { describe, it, expect } from "vitest";
import { schritte, einkauf, zutatText } from "../app/ansichten.js";
import { parseMenge, zeigeMenge, skaliere } from "../app/menge.js";

const karte = {
  schema: "rezeptkarte/1", title: "Brot",
  step: { do: "backen 200 °C", note: "unterste Schiene", in: [
    { do: "vermengen", in: ["Mehl: 300 g", "Wasser (lauwarm): ½ l"] },
    { do: "ausstreuen", in: ["Haferflocken (grob)"] },
    "Mehl: 100 g"] }
};

describe("Mengen", () => {
  it("liest Brüche und Kommazahlen", () => {
    expect(parseMenge("½")).toBe(0.5);
    expect(parseMenge("1½")).toBe(1.5);
    expect(parseMenge("2,5")).toBe(2.5);
    expect(parseMenge("")).toBe(null);
    expect(parseMenge("viel")).toBe(null);
  });
  it("schreibt halbe und viertel als Zeichen", () => {
    expect(zeigeMenge(0.5)).toBe("½");
    expect(zeigeMenge(1.5)).toBe("1½");
    expect(zeigeMenge(2.5)).toBe("2½");
    expect(zeigeMenge(2.3)).toBe("2,3");
    expect(zeigeMenge(300)).toBe("300");
    expect(zeigeMenge(null)).toBe("");
  });
  it("lässt eine fehlende Menge fehlen", () => {
    expect(skaliere(null, 2)).toBe(null);
  });
});

describe("Ablauf", () => {
  const liste = schritte(karte);

  it("zählt die Schritte in der Reihenfolge des Rasters auf", () => {
    expect(liste.map(s => s.text)).toEqual(["vermengen", "ausstreuen", "backen 200 °C"]);
  });
  it("nennt zu jedem Schritt nur seine eigenen Zutaten", () => {
    expect(liste[0].zutaten).toEqual(["300 g Mehl", "½ l Wasser (lauwarm)"]);
    expect(liste[2].zutaten).toEqual(["100 g Mehl"]);
  });
  it("übernimmt den Hinweis", () => {
    expect(liste[2].note).toBe("unterste Schiene");
  });
  it("rechnet die Mengen mit dem Faktor", () => {
    expect(schritte(karte, 2)[0].zutaten).toEqual(["600 g Mehl", "1 l Wasser (lauwarm)"]);
  });
});

describe("Einkauf", () => {
  const zettel = einkauf(karte);

  it("zählt dieselbe Zutat in derselben Einheit zusammen", () => {
    expect(zettel.find(p => p.name === "Mehl").menge).toBe("400 g");
  });
  it("zeigt, wie sich die Menge aufteilt", () => {
    expect(zettel.find(p => p.name === "Mehl").teile).toEqual(["300 g", "100 g"]);
  });
  it("nennt eine Zutat ohne Menge nach Bedarf", () => {
    expect(zettel.find(p => p.name === "Haferflocken").menge).toBe("nach Bedarf");
  });
  it("führt eine einmal verwendete Zutat ohne Aufteilung", () => {
    expect(zettel.find(p => p.name === "Wasser").teile).toEqual([]);
  });
  it("skaliert die Summe", () => {
    expect(einkauf(karte, 2).find(p => p.name === "Mehl").menge).toBe("800 g");
  });
});

describe("Zutat als Text", () => {
  it("setzt Menge, Einheit, Name und Zusatz zusammen", () => {
    expect(zutatText("Körner (z. B. Sonnenblumen): 100 g")).toBe("100 g Körner (z. B. Sonnenblumen)");
  });
  it("kommt ohne Menge aus", () => {
    expect(zutatText({ name: "Haferflocken", qual: "grob", amount: null, unit: "" }))
      .toBe("Haferflocken (grob)");
  });
});
