// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/r/uHzJv69TN6" }
// Die Kartenseite hat zweimal hintereinander zu viele Rechte gezeigt.
// Diese Tests halten fest, was der Pfad allein entscheidet.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("app/karte.html", "utf8");   // jsdom: import.meta.url ist eine http-URL
const karte = { schema: "rezeptkarte/1", id: "uHzJv69TN6", title: "Dinkelquarkbrot",
  step: { do: "backen", in: ["Dinkelmehl: 300 g"] } };

async function seiteLaden(pfad) {
  document.documentElement.innerHTML = html;
  history.replaceState(null, "", pfad);
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(karte), { status: 200,
      headers: { "Content-Type": "application/json" } })));
  vi.resetModules();
  await import("../app/karte.js");
  await vi.waitFor(() => expect(document.querySelector("#titel").textContent).toBe(karte.title));
}

const sichtbar = wahl => !document.querySelector(wahl).hidden;

describe("Ansichtslink /r/<id>", () => {
  beforeEach(async () => { await seiteLaden("/r/uHzJv69TN6"); });

  it("zeigt die Karte", () => {
    expect(document.querySelectorAll("#tabelle .zutat").length).toBe(1);
  });
  it("zeigt keinen Knopf zum Bearbeiten", () => {
    expect(sichtbar("#umschalten")).toBe(false);
  });
  it("zeigt keinen Knopf zum Löschen", () => {
    expect(sichtbar("#entfernen")).toBe(false);
  });
  it("merkt sich keinen Schlüssel", () => {
    expect(localStorage.getItem("lekka.karten")).not.toContain("schlüssel");
  });
});

describe("Bearbeitungslink /r/<id>/<schlüssel>", () => {
  beforeEach(async () => { await seiteLaden("/r/uHzJv69TN6/RbchTU9pxJKoQY6e5T7mtQ"); });

  it("zeigt den Knopf zum Bearbeiten", () => {
    expect(sichtbar("#umschalten")).toBe(true);
  });
  it("zeigt den Knopf zum Löschen", () => {
    expect(sichtbar("#entfernen")).toBe(true);
  });
  it("lässt den Schlüssel in der Adresszeile stehen", () => {
    expect(location.pathname).toBe("/r/uHzJv69TN6/RbchTU9pxJKoQY6e5T7mtQ");
  });
  it("legt den Schlüssel in der Liste ab", () => {
    expect(localStorage.getItem("lekka.karten")).toContain("RbchTU9pxJKoQY6e5T7mtQ");
  });
});

describe("Ansichtslink auf einem Gerät, das den Schlüssel kennt", () => {
  it("bleibt beim Lesen", async () => {
    await seiteLaden("/r/uHzJv69TN6/RbchTU9pxJKoQY6e5T7mtQ");
    expect(sichtbar("#umschalten")).toBe(true);
    // derselbe Browser, jetzt über den Ansichtslink
    document.documentElement.innerHTML = html;
    history.replaceState(null, "", "/r/uHzJv69TN6");
    vi.resetModules();
    await import("../app/karte.js");
    await vi.waitFor(() => expect(document.querySelector("#titel").textContent).toBe(karte.title));
    expect(sichtbar("#umschalten")).toBe(false);
    expect(sichtbar("#entfernen")).toBe(false);
  });
});
