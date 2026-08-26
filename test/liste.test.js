// Die Liste ist der einzige Ort, an dem ein Bearbeitungsschlüssel liegt.
// Geht er verloren, ist die Karte für immer nur noch lesbar.
import { describe, it, expect, beforeEach } from "vitest";
import { alle, finden, merken, vergessen, darfÄndern } from "../app/liste.js";

let ablage;
beforeEach(() => {
  const inhalt = new Map();
  ablage = {
    getItem: k => inhalt.get(k) ?? null,
    setItem: (k, w) => inhalt.set(k, String(w)),
    inhalt
  };
});

describe("Merken", () => {
  it("legt einen Eintrag an", () => {
    merken({ id: "abc", titel: "Brot", schlüssel: "geheim" }, ablage);
    expect(alle(ablage)).toHaveLength(1);
    expect(finden("abc", ablage).titel).toBe("Brot");
  });
  it("legt denselben Eintrag nicht zweimal an", () => {
    merken({ id: "abc", titel: "Brot" }, ablage);
    merken({ id: "abc", titel: "Brot, neu" }, ablage);
    expect(alle(ablage)).toHaveLength(1);
    expect(finden("abc", ablage).titel).toBe("Brot, neu");
  });
  it("behält den Schlüssel, wenn dieselbe Karte ohne ihn geöffnet wird", () => {
    merken({ id: "abc", titel: "Brot", schlüssel: "geheim" }, ablage);
    merken({ id: "abc", titel: "Brot" }, ablage);
    expect(finden("abc", ablage).schlüssel).toBe("geheim");
  });
  it("nimmt einen später erhaltenen Schlüssel an", () => {
    merken({ id: "abc", titel: "Brot" }, ablage);
    expect(darfÄndern(finden("abc", ablage))).toBe(false);
    merken({ id: "abc", schlüssel: "geheim" }, ablage);
    expect(darfÄndern(finden("abc", ablage))).toBe(true);
  });
  it("stellt die zuletzt gesehene Karte nach vorn", () => {
    merken({ id: "a" }, ablage);
    merken({ id: "b" }, ablage);
    merken({ id: "a" }, ablage);
    expect(alle(ablage).map(e => e.id)).toEqual(["a", "b"]);
  });
});

describe("Vergessen", () => {
  it("entfernt nur den genannten Eintrag", () => {
    merken({ id: "a" }, ablage);
    merken({ id: "b" }, ablage);
    vergessen("a", ablage);
    expect(alle(ablage).map(e => e.id)).toEqual(["b"]);
  });
});

describe("Kaputter Speicher", () => {
  it("liefert bei Unsinn eine leere Liste statt zu werfen", () => {
    ablage.setItem("lekka.karten", "{kein json");
    expect(alle(ablage)).toEqual([]);
  });
  it("wirft Einträge ohne id weg", () => {
    ablage.setItem("lekka.karten", JSON.stringify([{ titel: "ohne id" }, { id: "gut" }]));
    expect(alle(ablage).map(e => e.id)).toEqual(["gut"]);
  });
  it("kommt ohne localStorage aus", () => {
    expect(alle(undefined)).toEqual([]);
  });
});
