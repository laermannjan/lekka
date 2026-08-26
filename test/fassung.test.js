// Wenn die Fassung sich nicht mit dem Inhalt ändert, servieren Clients nach
// einer Änderung weiter die alte App - genau der Fehler, den das Hochzählen
// von Hand immer wieder produziert hat.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fassung } from "../server/fassung.mjs";

let verzeichnis;
beforeEach(async () => {
  verzeichnis = await mkdtemp(join(tmpdir(), "lekka-fassung-"));
  await writeFile(join(verzeichnis, "a.js"), "eins");
  await writeFile(join(verzeichnis, "b.css"), "zwei");
});
afterEach(() => rm(verzeichnis, { recursive: true, force: true }));

describe("Fassung", () => {
  it("bleibt gleich, solange sich nichts ändert", async () => {
    expect(await fassung(verzeichnis)).toBe(await fassung(verzeichnis));
  });
  it("ändert sich, wenn eine Datei anderen Inhalt bekommt", async () => {
    const vorher = await fassung(verzeichnis);
    await writeFile(join(verzeichnis, "a.js"), "eins, geändert");
    expect(await fassung(verzeichnis)).not.toBe(vorher);
  });
  it("ändert sich, wenn eine Datei dazukommt", async () => {
    const vorher = await fassung(verzeichnis);
    await writeFile(join(verzeichnis, "c.js"), "drei");
    expect(await fassung(verzeichnis)).not.toBe(vorher);
  });
  it("ändert sich, wenn eine Datei umbenannt wird", async () => {
    const vorher = await fassung(verzeichnis);
    await rm(join(verzeichnis, "a.js"));
    await writeFile(join(verzeichnis, "z.js"), "eins");
    expect(await fassung(verzeichnis)).not.toBe(vorher);
  });
  it("erfasst auch Unterverzeichnisse", async () => {
    await mkdir(join(verzeichnis, "tief"));
    await writeFile(join(verzeichnis, "tief", "d.js"), "vier");
    const vorher = await fassung(verzeichnis);
    await writeFile(join(verzeichnis, "tief", "d.js"), "vier, geändert");
    expect(await fassung(verzeichnis)).not.toBe(vorher);
  });
  it("hängt nicht von der Reihenfolge im Dateisystem ab", async () => {
    const vorher = await fassung(verzeichnis);
    await rm(join(verzeichnis, "b.css"));
    await writeFile(join(verzeichnis, "b.css"), "zwei");
    expect(await fassung(verzeichnis)).toBe(vorher);
  });
});
