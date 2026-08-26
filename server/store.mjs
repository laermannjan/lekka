// Eine Karte ist eine Datei. Zugriffsmuster ist „hol per id“, dafür genügt
// ein Verzeichnis; eine Datenbank würde nichts hinzufügen.
import { mkdir, readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

// Ohne Verwechslungspaare: kein 0/O, kein 1/l/I.
const ZEICHEN = "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const ID_LÄNGE = 10;
const SCHLÜSSEL_LÄNGE = 22;

export const ID_MUSTER = new RegExp(`^[${ZEICHEN}]{${ID_LÄNGE}}$`);

function geheimnis(länge) {
  // Ablehnungsverfahren statt Modulo, sonst sind die ersten Zeichen häufiger.
  const grenze = 256 - (256 % ZEICHEN.length);
  let aus = "";
  while (aus.length < länge)
    for (const b of randomBytes(länge))
      if (b < grenze && aus.length < länge) aus += ZEICHEN[b % ZEICHEN.length];
  return aus;
}

const hash = wert => createHash("sha256").update(wert).digest("hex");

function gleich(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class Ablage {
  constructor(verzeichnis) {
    this.verzeichnis = verzeichnis;
  }

  async bereit() {
    await mkdir(this.verzeichnis, { recursive: true });
    return this;
  }

  #pfad(id) {
    if (!ID_MUSTER.test(id)) throw new Error("ungültige id");
    return join(this.verzeichnis, `${id}.json`);
  }

  async #lesen(id) {
    try {
      return JSON.parse(await readFile(this.#pfad(id), "utf8"));
    } catch (fehler) {
      if (fehler.code === "ENOENT") return null;
      throw fehler;
    }
  }

  // Legt an und gibt die beiden Geheimnisse zurück. Der Schlüssel wird nur
  // hier im Klartext gesehen; gespeichert wird sein Hash.
  async anlegen(karte) {
    const id = geheimnis(ID_LÄNGE);
    const schlüssel = geheimnis(SCHLÜSSEL_LÄNGE);
    const jetzt = new Date().toISOString();
    await writeFile(this.#pfad(id), JSON.stringify(
      { id, schlüsselHash: hash(schlüssel), createdAt: jetzt, updatedAt: jetzt,
        karte: { ...karte, id, updatedAt: jetzt } }, null, 2));
    return { id, schlüssel };
  }

  async holen(id) {
    const satz = await this.#lesen(id);
    return satz?.karte ?? null;
  }

  async darfÄndern(id, schlüssel) {
    const satz = await this.#lesen(id);
    if (!satz || typeof schlüssel !== "string" || !schlüssel) return false;
    return gleich(hash(schlüssel), satz.schlüsselHash);
  }

  async ersetzen(id, karte) {
    const satz = await this.#lesen(id);
    if (!satz) return null;
    const jetzt = new Date().toISOString();
    satz.updatedAt = jetzt;
    satz.karte = { ...karte, id, updatedAt: jetzt };
    await writeFile(this.#pfad(id), JSON.stringify(satz, null, 2));
    return satz.karte;
  }

  async löschen(id) {
    try {
      await unlink(this.#pfad(id));
      return true;
    } catch (fehler) {
      if (fehler.code === "ENOENT") return false;
      throw fehler;
    }
  }

  // Nur für Tests und Wartung. Über die API gibt es das absichtlich nicht:
  // wer keinen Link hat, soll nichts finden.
  async alle() {
    const dateien = await readdir(this.verzeichnis).catch(() => []);
    return dateien.filter(d => d.endsWith(".json")).map(d => d.slice(0, -5));
  }
}
