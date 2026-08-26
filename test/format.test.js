// FORMAT.md ist die Spezifikation. Damit sie nicht veraltet, wird jedes
// Beispiel darin eingelesen und gegen denselben Parser und dieselbe Prüfung
// gehalten, die auch die App benutzt.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lies, schreibe, verlustfrei } from "../app/notation.js";
import { prüfeKarte } from "../app/validate.js";
import { layout } from "../app/layout.js";

const text = readFileSync("FORMAT.md", "utf8");

const blöcke = (sprache) =>
  [...text.matchAll(new RegExp("```" + sprache + "\\n([\\s\\S]*?)```", "g"))]
    .map((treffer, i) => ({ nummer: i + 1, inhalt: treffer[1] }));

const listen = blöcke("karte");
const jsons = blöcke("karte-json");

describe("Beispiele in FORMAT.md", () => {
  it("es gibt welche", () => {
    expect(listen.length).toBeGreaterThan(2);
    expect(jsons.length).toBeGreaterThan(0);
  });

  for (const { nummer, inhalt } of listen) {
    describe(`Liste ${nummer}`, () => {
      it("lässt sich lesen", () => {
        expect(() => lies(inhalt)).not.toThrow();
      });
      it("ergibt eine gültige Karte", () => {
        expect(prüfeKarte(lies(inhalt))).toEqual([]);
      });
      it("kommt unverändert zurück", () => {
        const karte = lies(inhalt);
        expect(schreibe(lies(schreibe(karte)))).toBe(schreibe(karte));
      });
      it("ergibt ein Raster ohne Überlappung", () => {
        const { rows, cells } = layout(lies(inhalt));
        const belegt = new Set();
        for (const c of cells) for (let r = c.row; r < c.row + c.span; r++) {
          expect(belegt.has(`${c.col}|${r}`)).toBe(false);
          belegt.add(`${c.col}|${r}`);
        }
        expect(rows.length).toBeGreaterThan(0);
      });
    });
  }

  for (const { nummer, inhalt } of jsons) {
    describe(`JSON ${nummer}`, () => {
      it("ist gültiges JSON", () => {
        expect(() => JSON.parse(inhalt)).not.toThrow();
      });
      it("ist eine gültige Karte", () => {
        expect(prüfeKarte(JSON.parse(inhalt))).toEqual([]);
      });
      it("lässt sich als Liste schreiben und wieder lesen", () => {
        const karte = JSON.parse(inhalt);
        expect(verlustfrei(karte)).toBe(true);
        expect(lies(schreibe(karte)).step).toEqual(karte.step);
      });
    });
  }
});

describe("Die Tabelle der Zutatenzeilen", () => {
  // In §3 steht eine Tabelle „Zeile | Menge | Einheit | Name | Zusatz“.
  // Sie wird hier Zeile für Zeile nachgerechnet.
  const zeilen = [...text.matchAll(/^\| `([^`]+)` \| ([^|]*)\| ([^|]*)\| ([^|]*)\| ([^|]*)\|$/gm)];

  it("hat Einträge", () => {
    expect(zeilen.length).toBeGreaterThan(5);
  });

  for (const [, quelle, menge, einheit, name, qual] of zeilen) {
    it(quelle, () => {
      const gelesen = layout({ step: { do: "x", in: [quelle] } }).rows[0];
      const zeige = w => w === null ? "" : typeof w === "object"
        ? `${String(w.von).replace(".", ",")}–${String(w.bis).replace(".", ",")}`
        : String(w).replace(".", ",");
      expect(zeige(gelesen.amount)).toBe(menge.trim());
      expect(gelesen.unit).toBe(einheit.trim());
      expect(gelesen.name).toBe(name.trim());
      expect(gelesen.qual).toBe(qual.trim());
    });
  }
});
