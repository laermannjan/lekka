import { describe, it, expect } from "vitest";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schema/rezeptkarte-1.schema.json" with { type: "json" };
import { layout } from "../app/layout.js";

const ajv = addFormats(new Ajv({ strict: false }));
const validate = ajv.compile(schema);

const gut = {
  schema: "rezeptkarte/1", id: "8kQm2xVp", updatedAt: "2026-08-22T09:14:00Z",
  title: "Dinkelquarkbrot", yield: "1 Kastenbrot", prep: ["Kastenform 30 cm einfetten"],
  step: { do: "backen 200 °C Heißluft 60 min", note: "ohne Vorheizen",
    in: [{ do: "vermengen (von Hand)", in: ["Dinkelmehl: 300 g", "Wasser (lauwarm): ½ l"] },
         { do: "ausstreuen", in: [{ name: "Haferflocken", qual: "grob", amount: null, unit: "" }] }] }
};

describe("Schema", () => {
  it("nimmt ein vollständiges Rezept an", () => {
    expect(validate(gut)).toBe(true);
  });
  it("nimmt beide Zutatenformen an", () => {
    expect(validate(gut)).toBe(true);
  });
  it("lehnt eine unbekannte Schemaversion ab", () => {
    expect(validate({ ...gut, schema: "rezeptkarte/2" })).toBe(false);
  });
  it("lehnt einen Schritt ohne Kinder ab", () => {
    expect(validate({ ...gut, step: { do: "backen", in: [] } })).toBe(false);
  });
  it("lehnt ein Rezept ohne Titel ab", () => {
    const { title, ...ohne } = gut;
    expect(validate(ohne)).toBe(false);
  });
  it("lässt unbekannte Felder durch und layout() erhält sie im Baum", () => {
    const mit = { ...gut, quelle: "Familienarchiv" };
    expect(validate(mit)).toBe(true);
    expect(layout(mit).tree.quelle).toBe("Familienarchiv");
  });
});
