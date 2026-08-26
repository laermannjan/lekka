import * as liste from "./liste.js";
import * as api from "./api.js";
import * as transfer from "./transfer.js";

const $ = wahl => document.querySelector(wahl);
const meldung = $("#meldung");

const sagen = (text, schlecht = false) => {
  meldung.textContent = text;
  meldung.classList.toggle("schlecht", schlecht);
};

const VORLAGE = {
  schema: "rezeptkarte/1",
  title: "Neue Karte",
  yield: "",
  prep: [],
  step: { do: "vermengen", in: ["100 g Mehl", "50 g Wasser (lauwarm)"] }
};

const ansichtsLink = id => `${location.origin}/r/${id}`;
const änderungsLink = (id, schlüssel) => `${ansichtsLink(id)}/${schlüssel}`;

async function kopieren(text, was) {
  try {
    await navigator.clipboard.writeText(text);
    sagen(`${was} kopiert.`);
  } catch {
    sagen(`Kopieren ging nicht. Link: ${text}`, true);
  }
}

function zeichnen() {
  const einträge = liste.alle();
  const ziel = $("#karten");
  ziel.textContent = "";
  $("#leer").hidden = einträge.length > 0;

  for (const eintrag of einträge) {
    const zeile = document.createElement("li");

    // Der Name führt immer zum Lesen. Bearbeiten ist ein eigener Link, damit
    // ein Klick nie mehr Rechte mitbringt, als er verspricht.
    const änderbar = liste.darfÄndern(eintrag);
    const link = Object.assign(document.createElement("a"), {
      href: ansichtsLink(eintrag.id), className: "titel",
      textContent: eintrag.titel || eintrag.id });

    const marke = document.createElement("span");
    marke.className = änderbar ? "rolle" : "rolle nurlesen";
    marke.textContent = änderbar ? "bearbeitbar" : "nur lesen";

    const knopf = (beschriftung, tun) => {
      const b = document.createElement("button");
      b.className = "knopf still";
      b.textContent = beschriftung;
      b.addEventListener("click", tun);
      return b;
    };

    zeile.append(link, marke, Object.assign(document.createElement("span"), { className: "wachse" }),
      knopf("Link kopieren", () => kopieren(ansichtsLink(eintrag.id), "Ansichtslink")));
    if (änderbar) {
      zeile.append(Object.assign(document.createElement("a"), {
        href: änderungsLink(eintrag.id, eintrag.schlüssel), className: "knopf still",
        textContent: "Bearbeiten" }));
      zeile.append(knopf("Bearbeitungslink kopieren",
        () => kopieren(änderungsLink(eintrag.id, eintrag.schlüssel), "Bearbeitungslink")));
    }
    zeile.append(knopf("Entfernen", () => {
      // Nur aus dieser Liste. Die Karte selbst bleibt, der Link gilt weiter.
      liste.vergessen(eintrag.id);
      sagen(`„${eintrag.titel || eintrag.id}“ aus der Liste entfernt. Die Karte bleibt bestehen.`);
      zeichnen();
    }));

    ziel.append(zeile);
  }
}

$("#neu").addEventListener("click", async () => {
  try {
    const { id, schlüssel } = await api.anlegen(VORLAGE);
    liste.merken({ id, schlüssel, titel: VORLAGE.title });
    location.href = änderungsLink(id, schlüssel);
  } catch (fehler) {
    sagen(`Anlegen ging nicht: ${fehler.message}`, true);
  }
});

$("#einlesen").addEventListener("click", () => $("#datei").click());

$("#datei").addEventListener("change", async ereignis => {
  const datei = ereignis.target.files[0];
  if (!datei) return;
  ereignis.target.value = "";
  try {
    const bericht = await transfer.einlesen(await datei.text());
    const teile = [];
    if (bericht.neu) teile.push(`${bericht.neu} neu angelegt`);
    if (bericht.verknüpft) teile.push(`${bericht.verknüpft} wiederverbunden`);
    if (bericht.fehler.length) teile.push(`${bericht.fehler.length} abgelehnt`);
    sagen(teile.join(", ") + (bericht.fehler.length ? ` - ${bericht.fehler[0]}` : ""),
      bericht.fehler.length > 0);
    zeichnen();
  } catch (fehler) {
    sagen(fehler.message, true);
  }
});

$("#sichern").addEventListener("click", async () => {
  sagen("Sammle Karten …");
  const bündel = await transfer.bündelBauen();
  if (bündel.karten.length === 0) return sagen("Nichts zu sichern.", true);
  transfer.herunterladen(`lekka-${new Date().toISOString().slice(0, 10)}.json`, bündel);
  sagen(`${bündel.karten.length} Karten gesichert. Die Datei enthält die Bearbeitungsschlüssel.`);
});

zeichnen();
if (!navigator.onLine) sagen("Offline. Bekannte Karten lassen sich lesen, aber nicht ändern.");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
