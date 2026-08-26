// Was der Link darf, muss man sehen können. Diese Prüfung braucht einen
// echten Browser: der Fehler, der sie ausgelöst hat, war eine CSS-Regel, die
// [hidden] überstimmte. jsdom bildet die Kaskade dafür nicht nach und meldete
// die Knöpfe als verborgen, während sie im Browser sichtbar waren.
import { test, expect } from "@playwright/test";

async function neueKarte(seite) {
  await seite.goto("/");
  await seite.click("#neu");
  await seite.waitForURL(/\/r\/[^/]+\/[^/]+$/);
  await seite.waitForSelector("#tabelle .zutat");
  const [, , id, schlüssel] = new URL(seite.url()).pathname.split("/");
  return { id, schlüssel };
}

test("der Bearbeitungslink zeigt die Bearbeitung", async ({ page }) => {
  await neueKarte(page);
  await expect(page.locator("#umschalten")).toBeVisible();
  await expect(page.locator("#entfernen")).toBeVisible();
});

test("der Ansichtslink zeigt sie nicht, auch auf demselben Gerät", async ({ page }) => {
  const { id } = await neueKarte(page);
  await page.goto(`/r/${id}`);
  await page.waitForSelector("#tabelle .zutat");
  await expect(page.locator("#umschalten")).toBeHidden();
  await expect(page.locator("#entfernen")).toBeHidden();
});

test("der Name in der Übersicht führt zum Lesen", async ({ page }) => {
  const { id, schlüssel } = await neueKarte(page);
  await page.goto("/");
  const titel = page.locator(".karten li .titel").first();
  await expect(titel).toHaveAttribute("href", new RegExp(`/r/${id}$`));
  expect(await titel.getAttribute("href")).not.toContain(schlüssel);
  await page.click(".karten li .titel");
  await page.waitForSelector("#tabelle .zutat");
  await expect(page.locator("#umschalten")).toBeHidden();
});

test("ein fremdes Gerät kann mit dem Ansichtslink nur lesen", async ({ page, browser }) => {
  const { id } = await neueKarte(page);
  const fremd = await (await browser.newContext()).newPage();
  await fremd.goto(`/r/${id}`);
  await fremd.waitForSelector("#tabelle .zutat");
  await expect(fremd.locator("#umschalten")).toBeHidden();
  await expect(fremd.locator("#entfernen")).toBeHidden();
});

test("Ändern über den Bearbeitungslink kommt an", async ({ page }) => {
  const { id, schlüssel } = await neueKarte(page);
  await page.click("#umschalten");
  await page.click("#titel");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Dinkelquarkbrot");
  await page.click("#speichern");
  await expect(page.locator("#meldung")).toHaveText("Gespeichert.");
  await page.goto(`/r/${id}/${schlüssel}`);
  await expect(page.locator("#titel")).toHaveText("Dinkelquarkbrot");
});

test.describe("Bearbeiten in der Karte", () => {
  test("ändert eine Menge und speichert sie", async ({ page }) => {
    const { id, schlüssel } = await neueKarte(page);
    await page.click("#umschalten");
    const menge = page.locator('.zutat .menge').first();
    await menge.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("250");
    await expect(page.locator("#zaehler")).toHaveText("1 Änderung");
    await page.click("#speichern");
    await expect(page.locator("#meldung")).toHaveText("Gespeichert.");

    await page.goto(`/r/${id}/${schlüssel}`);
    await page.waitForSelector("#tabelle .zutat");
    await expect(page.locator(".zutat .menge").first()).toHaveText("250");
  });

  test("zählt jedes Feld einzeln", async ({ page }) => {
    await neueKarte(page);
    await page.click("#umschalten");
    await page.locator(".zutat .name").first().click();
    await page.keyboard.type("X");
    await page.locator(".zelle .verb").first().click();
    await page.keyboard.type("Y");
    await expect(page.locator("#zaehler")).toHaveText("2 Änderungen");
  });

  test("nimmt Verwerfen zurück auf den gespeicherten Stand", async ({ page }) => {
    await neueKarte(page);
    await page.click("#umschalten");
    const name = page.locator(".zutat .name").first();
    const vorher = await name.textContent();
    await name.click();
    await page.keyboard.type("X");
    page.on("dialog", d => d.accept());
    await page.click("#verwerfen");
    await expect(page.locator(".zutat .name").first()).toHaveText(vorher);
    await expect(page.locator("#zaehler")).toHaveText("");
  });

  test("ohne Schlüssel gibt es nichts zu bearbeiten", async ({ page }) => {
    const { id } = await neueKarte(page);
    await page.goto(`/r/${id}`);
    await page.waitForSelector("#tabelle .zutat");
    await expect(page.locator("#umschalten")).toBeHidden();
    expect(await page.locator(".zutat .name").first().getAttribute("contenteditable")).not.toBe("plaintext-only");
  });
});

test("die Struktur lässt sich als Liste umhängen", async ({ page }) => {
  await neueKarte(page);
  await page.click("#umschalten");
  await page.click("#struktur summary");
  const text = await page.inputValue("#quelle");
  expect(text).toMatch(/^# /);
  expect(text).toContain("- vermengen");

  // Das Wasser bekommt einen eigenen Schritt davor: eine Zeile mehr, eine
  // Einrückung tiefer. Aus einer Spalte werden zwei.
  await page.fill("#quelle",
    text.replace("  - 50 g Wasser (lauwarm)", "  - quellen lassen\n    - 50 g Wasser (lauwarm)"));
  await page.click("#uebernehmen");
  await expect(page.locator("#strukturmeldung")).toContainText("Übernommen");
  await expect(page.locator(".zelle .verb")).toHaveText(["quellen lassen", "vermengen"]);
  await expect(page.locator(".spaltenkopf")).toHaveText(["Zutaten", "01", "02"]);
});

test("eine kaputte Liste sagt, in welcher Zeile es klemmt", async ({ page }) => {
  await neueKarte(page);
  await page.click("#umschalten");
  await page.click("#struktur summary");
  await page.fill("#quelle", "# Brot\nbacken\n");
  await page.click("#uebernehmen");
  await expect(page.locator("#strukturmeldung")).toContainText("Zeile 2");
});
