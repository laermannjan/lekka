// Die Karten in rezepte/ werden ausgeliefert und importiert, also müssen sie
// gültig sein und ein sauberes Raster ergeben - sonst fällt es erst im Browser auf.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { prüfeKarte } from "../app/validate.js";
import { layout } from "../app/layout.js";

const dateien = readdirSync("rezepte").filter(d => d.endsWith(".json")).sort();

describe("Karten in rezepte/", () => {
  it("es gibt welche", () => {
    expect(dateien.length).toBeGreaterThan(0);
  });

  for (const datei of dateien) {
    const karte = JSON.parse(readFileSync(`rezepte/${datei}`, "utf8"));

    describe(datei, () => {
      it("ist gültig", () => {
        expect(prüfeKarte(karte)).toEqual([]);
      });
      it("heißt wie ihre Datei", () => {
        const erwartet = karte.title.toLowerCase()
          .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
        expect(datei).toBe(`${erwartet}.json`);
      });
      it("ergibt ein Raster ohne Überlappung", () => {
        const { rows, cells } = layout(karte);
        const belegt = new Set();
        for (const zelle of cells) {
          expect(zelle.row + zelle.span).toBeLessThanOrEqual(rows.length);
          for (let r = zelle.row; r < zelle.row + zelle.span; r++) {
            expect(belegt.has(`${zelle.col}|${r}`)).toBe(false);
            belegt.add(`${zelle.col}|${r}`);
          }
        }
      });
      it("führt jede Zutat in einen Schritt", () => {
        const { rows, cells } = layout(karte);
        for (let r = 0; r < rows.length; r++)
          expect(cells.some(c => r >= c.row && r < c.row + c.span)).toBe(true);
      });
    });
  }
});
