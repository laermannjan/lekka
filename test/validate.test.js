// Der handgeschriebene Prüfer und das JSON-Schema müssen dasselbe sagen.
// Ohne diesen Test driften sie auseinander, sobald eines von beiden wächst.
import { describe, it, expect } from "vitest";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schema/rezeptkarte-1.schema.json" with { type: "json" };
import { prüfeKarte, istGültig } from "../app/validate.js";

const ajv = addFormats(new Ajv({ strict: false }));
const nachSchema = ajv.compile(schema);

const basis = {
  schema: "rezeptkarte/1", title: "Dinkelquarkbrot", yield: "1 Kastenbrot",
  prep: ["Kastenform 30 cm einfetten"],
  step: { do: "backen 200 °C", note: "unterste Schiene",
    in: ["Dinkelmehl: 300 g", { name: "Haferflocken", qual: "grob", amount: null, unit: "" }] }
};
const ohne = (feld) => { const { [feld]: _, ...rest } = basis; return rest; };

const fälle = [
  ["vollständig", basis],
  ["mit id und updatedAt", { ...basis, id: "8kQm2xVp", updatedAt: "2026-08-22T09:14:00Z" }],
  ["verschachtelte Schritte", { ...basis,
    step: { do: "backen", in: [{ do: "vermengen", in: ["Salz: 1 g"] }, "Mehl: 2 g"] } }],
  ["unbekanntes Feld", { ...basis, quelle: "Familienarchiv" }],
  ["ohne title", ohne("title")],
  ["ohne step", ohne("step")],
  ["falsche Schemaversion", { ...basis, schema: "rezeptkarte/2" }],
  ["schema fehlt", ohne("schema")],
  ["leerer title", { ...basis, title: "" }],
  ["Schritt ohne Kinder", { ...basis, step: { do: "backen", in: [] } }],
  ["Schritt ohne do", { ...basis, step: { in: ["Salz: 1 g"] } }],
  ["Schritt mit leerem do", { ...basis, step: { do: "", in: ["Salz: 1 g"] } }],
  ["in ist kein Array", { ...basis, step: { do: "backen", in: "Salz: 1 g" } }],
  ["leere Zutat", { ...basis, step: { do: "backen", in: [""] } }],
  ["Zutat ohne name", { ...basis, step: { do: "backen", in: [{ amount: 1, unit: "g" }] } }],
  ["amount ist Text", { ...basis, step: { do: "backen", in: [{ name: "Mehl", amount: "viel" }] } }],
  ["amount ist null", { ...basis, step: { do: "backen", in: [{ name: "Mehl", amount: null }] } }],
  ["prep ist kein Array", { ...basis, prep: "Form einfetten" }],
  ["prep enthält Zahl", { ...basis, prep: [42] }],
  ["yield ist Zahl", { ...basis, yield: 1 }],
  ["id zu kurz", { ...basis, id: "abc" }],
  ["updatedAt kein Zeitpunkt", { ...basis, updatedAt: "gestern" }],
  ["tief verschachtelt kaputt", { ...basis,
    step: { do: "backen", in: [{ do: "vermengen", in: [{ do: "rühren", in: [] }] }] } }],
  ["gar kein Objekt", "Dinkelquarkbrot"],
  ["null", null]
];

describe("Prüfer und Schema stimmen überein", () => {
  for (const [name, karte] of fälle) {
    it(name, () => {
      expect(istGültig(karte)).toBe(nachSchema(karte));
    });
  }
});

describe("Fehlermeldungen", () => {
  it("nennt den Pfad zum kaputten Schritt", () => {
    const fehler = prüfeKarte({ ...basis,
      step: { do: "backen", in: [{ do: "vermengen", in: [{ do: "rühren", in: [] }] }] } });
    expect(fehler[0]).toContain("step.in[0].in[0]");
  });
  it("sammelt mehrere Fehler statt beim ersten aufzuhören", () => {
    expect(prüfeKarte({ schema: "falsch" }).length).toBeGreaterThan(1);
  });
  it("meldet nichts bei einer gültigen Karte", () => {
    expect(prüfeKarte(basis)).toEqual([]);
  });
});
