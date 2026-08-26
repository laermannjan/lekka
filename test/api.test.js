// @vitest-environment jsdom
// Ein toter Server und fehlendes Netz sehen für fetch gleich aus. Für den
// Menschen davor nicht.
import { describe, it, expect, vi, afterEach } from "vitest";
import * as api from "../app/api.js";

const antwort = (körper, status = 200) =>
  new Response(JSON.stringify(körper), { status,
    headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("Unerreichbarer Server", () => {
  it("nennt den Server, wenn das Gerät online ist", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await expect(api.holen("abc")).rejects.toThrow(/Server nicht erreichbar/);
  });
  it("nennt das fehlende Netz, wenn das Gerät offline ist", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(api.holen("abc")).rejects.toThrow(/Offline/);
  });
  it("behält die ursprüngliche Ursache", async () => {
    const ursprung = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(ursprung)));
    await expect(api.holen("abc")).rejects.toMatchObject({ status: 0, ursache: ursprung });
  });
});

describe("Antworten des Servers", () => {
  it("gibt den Körper zurück", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwort({ title: "Brot" })));
    expect(await api.holen("abc")).toEqual({ title: "Brot" });
  });
  it("reicht die Begründung einer abgelehnten Karte durch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwort({ fehler: ["title fehlt"] }, 422)));
    await expect(api.anlegen({})).rejects.toThrow("title fehlt");
  });
  it("merkt sich den Status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => antwort({ fehler: "gibt es nicht" }, 404)));
    await expect(api.holen("abc")).rejects.toMatchObject({ status: 404 });
  });
  it("schickt den Schlüssel als Kopfzeile, nicht in der URL", async () => {
    const gerufen = vi.fn(async () => antwort({ ok: true }));
    vi.stubGlobal("fetch", gerufen);
    await api.ersetzen("abc", "geheim", { title: "Brot" });
    const [url, optionen] = gerufen.mock.calls[0];
    expect(url).not.toContain("geheim");
    expect(optionen.headers["x-edit-key"]).toBe("geheim");
  });
  it("schickt ohne Schlüssel auch keine Kopfzeile", async () => {
    const gerufen = vi.fn(async () => antwort({ ok: true }));
    vi.stubGlobal("fetch", gerufen);
    await api.ersetzen("abc", null, { title: "Brot" });
    expect(gerufen.mock.calls[0][1].headers).toEqual({});
  });
});
