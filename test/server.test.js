import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { starten } from "../server/index.mjs";

const karte = {
  schema: "rezeptkarte/1", title: "Dinkelquarkbrot", yield: "1 Kastenbrot",
  step: { do: "backen 200 °C", in: ["Dinkelmehl: 300 g", "Wasser (lauwarm): ½ l"] }
};

let basis, aufräumen, verzeichnis;

beforeAll(async () => {
  verzeichnis = await mkdtemp(join(tmpdir(), "lekka-"));
  const { server, port } = await starten({ port: 0, datenVerzeichnis: verzeichnis });
  basis = `http://127.0.0.1:${port}`;
  aufräumen = () => new Promise(f => server.close(f));
});
afterAll(async () => {
  await aufräumen();
  await rm(verzeichnis, { recursive: true, force: true });
});

const anlegen = async (inhalt = karte) => {
  const antwort = await fetch(`${basis}/api/recipes`,
    { method: "POST", body: JSON.stringify(inhalt) });
  return [antwort, await antwort.json()];
};

describe("Karte anlegen", () => {
  it("gibt id und Schlüssel zurück", async () => {
    const [antwort, { id, schlüssel }] = await anlegen();
    expect(antwort.status).toBe(201);
    expect(id).toMatch(/^[^\s]{10}$/);
    expect(schlüssel).toHaveLength(22);
    expect(schlüssel).not.toBe(id);
  });
  it("vergibt bei jedem Aufruf neue Geheimnisse", async () => {
    const [, a] = await anlegen(), [, b] = await anlegen();
    expect(a.id).not.toBe(b.id);
    expect(a.schlüssel).not.toBe(b.schlüssel);
  });
  it("lehnt eine ungültige Karte mit Begründung ab", async () => {
    const [antwort, körper] = await anlegen({ schema: "rezeptkarte/1", title: "" });
    expect(antwort.status).toBe(422);
    expect(körper.fehler.join(" ")).toContain("title");
  });
  it("lehnt unlesbaren Körper ab", async () => {
    const antwort = await fetch(`${basis}/api/recipes`, { method: "POST", body: "kein json" });
    expect(antwort.status).toBe(400);
  });
});

describe("Karte lesen", () => {
  it("liefert die Karte samt id und updatedAt", async () => {
    const [, { id }] = await anlegen();
    const gelesen = await (await fetch(`${basis}/api/recipes/${id}`)).json();
    expect(gelesen.title).toBe("Dinkelquarkbrot");
    expect(gelesen.id).toBe(id);
    expect(gelesen.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it("verrät den Schlüssel nicht", async () => {
    const [, { id, schlüssel }] = await anlegen();
    const roh = await (await fetch(`${basis}/api/recipes/${id}`)).text();
    expect(roh).not.toContain(schlüssel);
    expect(roh).not.toContain("Hash");
  });
  it("kennt eine unbekannte id nicht", async () => {
    expect((await fetch(`${basis}/api/recipes/abcdefghij`)).status).toBe(404);
  });
  it("hat kein Verzeichnis aller Karten", async () => {
    expect((await fetch(`${basis}/api/recipes`)).status).toBe(405);
  });
});

describe("Karte ändern", () => {
  it("nimmt den richtigen Schlüssel an", async () => {
    const [, { id, schlüssel }] = await anlegen();
    const antwort = await fetch(`${basis}/api/recipes/${id}`, { method: "PUT",
      headers: { "x-edit-key": schlüssel },
      body: JSON.stringify({ ...karte, title: "Erdkruste" }) });
    expect(antwort.status).toBe(200);
    expect((await (await fetch(`${basis}/api/recipes/${id}`)).json()).title).toBe("Erdkruste");
  });
  it("weist einen falschen Schlüssel ab", async () => {
    const [, { id }] = await anlegen();
    const antwort = await fetch(`${basis}/api/recipes/${id}`, { method: "PUT",
      headers: { "x-edit-key": "x".repeat(22) }, body: JSON.stringify(karte) });
    expect(antwort.status).toBe(403);
  });
  it("weist einen fehlenden Schlüssel ab", async () => {
    const [, { id }] = await anlegen();
    expect((await fetch(`${basis}/api/recipes/${id}`,
      { method: "PUT", body: JSON.stringify(karte) })).status).toBe(403);
  });
  it("nimmt den Schlüssel einer anderen Karte nicht an", async () => {
    const [, { id }] = await anlegen();
    const [, fremd] = await anlegen();
    const antwort = await fetch(`${basis}/api/recipes/${id}`, { method: "PUT",
      headers: { "x-edit-key": fremd.schlüssel }, body: JSON.stringify(karte) });
    expect(antwort.status).toBe(403);
  });
  it("prüft auch beim Ändern gegen das Schema", async () => {
    const [, { id, schlüssel }] = await anlegen();
    const antwort = await fetch(`${basis}/api/recipes/${id}`, { method: "PUT",
      headers: { "x-edit-key": schlüssel }, body: JSON.stringify({ title: "kaputt" }) });
    expect(antwort.status).toBe(422);
  });
});

describe("Karte löschen", () => {
  it("löscht mit Schlüssel", async () => {
    const [, { id, schlüssel }] = await anlegen();
    expect((await fetch(`${basis}/api/recipes/${id}`,
      { method: "DELETE", headers: { "x-edit-key": schlüssel } })).status).toBe(200);
    expect((await fetch(`${basis}/api/recipes/${id}`)).status).toBe(404);
  });
  it("löscht nicht ohne Schlüssel", async () => {
    const [, { id }] = await anlegen();
    expect((await fetch(`${basis}/api/recipes/${id}`, { method: "DELETE" })).status).toBe(403);
    expect((await fetch(`${basis}/api/recipes/${id}`)).status).toBe(200);
  });
});

describe("Seiten", () => {
  it("liefert die Übersicht", async () => {
    const text = await (await fetch(`${basis}/`)).text();
    expect(text).toContain("<title>");
  });
  it("liefert für den Ansichtslink die Kartenseite", async () => {
    const [, { id }] = await anlegen();
    const antwort = await fetch(`${basis}/r/${id}`);
    expect(antwort.status).toBe(200);
    expect(await antwort.text()).toContain("karte.js");
  });
  it("liefert für den Bearbeitungslink dieselbe Seite", async () => {
    const [, { id, schlüssel }] = await anlegen();
    const antwort = await fetch(`${basis}/r/${id}/${schlüssel}`);
    expect(antwort.status).toBe(200);
    expect(await antwort.text()).toContain("karte.js");
  });
  it("liefert für einen zu tiefen Pfad keine Seite", async () => {
    const [, { id, schlüssel }] = await anlegen();
    expect((await fetch(`${basis}/r/${id}/${schlüssel}/mehr`)).status).toBe(404);
  });
  it("setzt in sw.js eine Fassung aus dem Inhalt ein", async () => {
    const text = await (await fetch(`${basis}/sw.js`)).text();
    expect(text).toMatch(/const V = "lekka-[0-9a-f]{12}"/);
    expect(text).not.toContain('"lekka-dev"');
  });
  it("kommt aus dem App-Verzeichnis nicht heraus", async () => {
    const antwort = await fetch(`${basis}/../package.json`);
    expect(antwort.status).toBe(404);
  });
});
