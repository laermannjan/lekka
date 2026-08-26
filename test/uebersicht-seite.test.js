// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
// In der Übersicht zeigte der Name der Karte auf den Bearbeitungslink,
// sobald das Gerät den Schlüssel kannte. Ein Klick brachte damit mehr
// Rechte mit, als er versprach.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("app/index.html", "utf8");

async function übersichtLaden(einträge) {
  document.documentElement.innerHTML = html;
  localStorage.clear();
  localStorage.setItem("lekka.karten", JSON.stringify(einträge));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  vi.resetModules();
  await import("../app/uebersicht.js");
}

const zeilen = () => [...document.querySelectorAll("#karten li")];
const linkMitText = (zeile, text) =>
  [...zeile.querySelectorAll("a")].find(a => a.textContent === text);

describe("Karte mit bekanntem Schlüssel", () => {
  beforeEach(() => übersichtLaden([
    { id: "uHzJv69TN6", titel: "Dinkelquarkbrot", schlüssel: "RbchTU9pxJKoQY6e5T7mtQ" }]));

  it("führt vom Namen zum Lesen", () => {
    expect(linkMitText(zeilen()[0], "Dinkelquarkbrot").getAttribute("href"))
      .toBe("http://localhost/r/uHzJv69TN6");
  });
  it("bietet das Bearbeiten als eigenen Link an", () => {
    expect(linkMitText(zeilen()[0], "Bearbeiten").getAttribute("href"))
      .toBe("http://localhost/r/uHzJv69TN6/RbchTU9pxJKoQY6e5T7mtQ");
  });
  it("nennt keinen Schlüssel im Link zum Lesen", () => {
    expect(linkMitText(zeilen()[0], "Dinkelquarkbrot").getAttribute("href"))
      .not.toContain("RbchTU9pxJKoQY6e5T7mtQ");
  });
  it("kennzeichnet sie als bearbeitbar", () => {
    expect(zeilen()[0].querySelector(".rolle").textContent).toBe("bearbeitbar");
  });
});

describe("Karte ohne Schlüssel", () => {
  beforeEach(() => übersichtLaden([{ id: "abcdefghij", titel: "Fremdes Brot" }]));

  it("führt vom Namen zum Lesen", () => {
    expect(linkMitText(zeilen()[0], "Fremdes Brot").getAttribute("href"))
      .toBe("http://localhost/r/abcdefghij");
  });
  it("bietet kein Bearbeiten an", () => {
    expect(linkMitText(zeilen()[0], "Bearbeiten")).toBeUndefined();
  });
  it("kennzeichnet sie als nur lesbar", () => {
    expect(zeilen()[0].querySelector(".rolle").textContent).toBe("nur lesen");
  });
});

describe("Leere Liste", () => {
  it("sagt, dass nichts da ist", async () => {
    await übersichtLaden([]);
    expect(document.querySelector("#leer").hidden).toBe(false);
    expect(zeilen()).toHaveLength(0);
  });
});
