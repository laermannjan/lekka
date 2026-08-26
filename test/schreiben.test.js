// Der Editor schreibt ins Raster, gespeichert wird der Baum. Geht dabei die
// Form einer Zutat verloren, ändert sich die Datei von jemandem, der sie von
// Hand geschrieben hat, an Stellen, die er nie angefasst hat.
import { describe, it, expect } from "vitest";
import { layout } from "../app/layout.js";
import { schreibeZutat, schreibeSchritt, alsText } from "../app/schreiben.js";
import { änderungen, beschreibe } from "../app/aenderungen.js";

const frisch = () => ({
  schema: "rezeptkarte/1", title: "Brot", yield: "1 Laib", prep: ["Form einfetten"],
  step: { do: "backen 200 °C", note: "unterste Schiene", in: [
    { do: "vermengen (von Hand)", in: [
      "Dinkelmehl: 300 g",
      "Wasser (lauwarm): ½ l",
      { amount: null, unit: "", name: "Haferflocken", qual: "grob" }] }] }
});

describe("Zutat zurückschreiben", () => {
  it("behält den String als String", () => {
    const k = frisch(), { herkunft } = layout(k);
    schreibeZutat(herkunft, 0, { amount: 400 });
    expect(k.step.in[0].in[0]).toBe("Dinkelmehl: 400 g");
  });
  it("behält das Objekt als Objekt", () => {
    const k = frisch(), { herkunft } = layout(k);
    schreibeZutat(herkunft, 2, { qual: "fein" });
    expect(k.step.in[0].in[2]).toEqual({ amount: null, unit: "", name: "Haferflocken", qual: "fein" });
  });
  it("behält unbekannte Felder eines Objekts", () => {
    const k = frisch();
    k.step.in[0].in[2].herkunft = "Hofladen";
    const { herkunft } = layout(k);
    schreibeZutat(herkunft, 2, { name: "Hafer" });
    expect(k.step.in[0].in[2].herkunft).toBe("Hofladen");
  });
  it("schreibt den Bruch wieder als Bruch", () => {
    const k = frisch(), { herkunft } = layout(k);
    schreibeZutat(herkunft, 1, { qual: "kalt" });
    expect(k.step.in[0].in[1]).toBe("Wasser (lauwarm): ½ l".replace("lauwarm", "kalt"));
  });
  it("lässt eine Zutat ohne Menge ohne Menge", () => {
    expect(alsText({ amount: null, unit: "", name: "Haferflocken", qual: "grob" }))
      .toBe("Haferflocken (grob)");
  });
  it("ändert nichts, wenn nichts übergeben wird", () => {
    const k = frisch(), vorher = JSON.stringify(k), { herkunft } = layout(k);
    schreibeZutat(herkunft, 0, {});
    expect(JSON.stringify(k)).toBe(vorher);
  });
});

describe("Schritt zurückschreiben", () => {
  it("ändert das Verb", () => {
    const k = frisch(), { herkunft } = layout(k);
    schreibeSchritt(herkunft, 1, { text: "backen 210 °C" });
    expect(k.step.do).toBe("backen 210 °C");
    expect(k.step.note).toBe("unterste Schiene");
  });
  it("holt einen Hinweis aus der Klammer in sein eigenes Feld", () => {
    // Sonst stünde er zweimal da, sobald jemand das Verb anfasst.
    const k = frisch(), { herkunft } = layout(k);
    schreibeSchritt(herkunft, 0, { text: "verkneten" });
    expect(k.step.in[0].do).toBe("verkneten");
    expect(k.step.in[0].note).toBe("von Hand");
  });
  it("entfernt ein leeres Hinweisfeld", () => {
    const k = frisch(), { herkunft } = layout(k);
    schreibeSchritt(herkunft, 1, { note: "" });
    expect("note" in k.step).toBe(false);
  });
});

describe("Änderungen zählen", () => {
  it("zählt nichts an einer unberührten Karte", () => {
    expect(änderungen(frisch(), frisch())).toBe(0);
  });
  it("zählt jedes geänderte Feld einzeln", () => {
    const neu = frisch();
    neu.title = "Anderes Brot";
    neu.step.in[0].in[0] = "Dinkelmehl: 400 g";
    expect(änderungen(frisch(), neu)).toBe(2);
  });
  it("zählt Menge und Name getrennt", () => {
    const neu = frisch();
    neu.step.in[0].in[0] = "Roggenmehl: 400 g";
    expect(änderungen(frisch(), neu)).toBe(2);
  });
  it("merkt eine geänderte Vorbereitung", () => {
    const neu = frisch();
    neu.prep = ["Form fetten und mehlen"];
    expect(änderungen(frisch(), neu)).toBe(1);
  });
  it("merkt einen entfernten Schritt", () => {
    const neu = frisch();
    neu.step.in = ["Dinkelmehl: 300 g"];
    expect(änderungen(frisch(), neu)).toBeGreaterThan(0);
  });
  it("beschreibt die Zahl in Worten", () => {
    expect(beschreibe(0)).toBe("");
    expect(beschreibe(1)).toBe("1 Änderung");
    expect(beschreibe(4)).toBe("4 Änderungen");
  });
});
