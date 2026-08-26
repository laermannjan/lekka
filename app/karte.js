import { render } from "./render.js";
import { schritte, einkauf } from "./ansichten.js";
import { prüfeKarte } from "./validate.js";
import { bearbeitbar, abschalten } from "./editor.js";
import { änderungen, beschreibe } from "./aenderungen.js";
import * as notation from "./notation.js";
import * as api from "./api.js";
import * as liste from "./liste.js";
import * as transfer from "./transfer.js";

const $ = wahl => document.querySelector(wahl);
const meldung = $("#meldung");
const sagen = (text, schlecht = false) => {
  meldung.textContent = text;
  meldung.classList.toggle("schlecht", schlecht);
};

// Der Link ist das Recht, wie bei Nuudel: /r/<id> liest, /r/<id>/<schlüssel>
// ändert. Beides bleibt in der Adresszeile stehen.
const teile = location.pathname.split("/").filter(Boolean);   // ["r", id, schlüssel?]
const id = teile[1] ?? "";
const schlüssel = teile[2] ?? null;

let karte = null;        // die Karte, wie sie gerade dasteht
let gespeichert = null;  // wie sie zuletzt vom Server kam
let faktor = 1;
let ansicht = "tabelle";
let bearbeiten = false;

const kasten = (klasse, ...kinder) => {
  const d = document.createElement("div");
  d.className = klasse;
  for (const k of kinder) if (k) d.append(k);
  return d;
};
const feld = (klasse, text) => {
  if (!text) return null;
  const d = document.createElement("div");
  d.className = klasse;
  d.textContent = text;
  return d;
};

function zeichnen() {
  document.title = `${karte.title} — Lekka`;
  $("#titel").textContent = karte.title;

  const angaben = $("#angaben");
  angaben.textContent = "";
  const worte = [karte.yield, ...(karte.meta ?? []), faktor === 1 ? null : `${faktor}× Menge`];
  for (const wort of worte.filter(Boolean))
    angaben.append(Object.assign(document.createElement("span"), { textContent: wort }));

  render(karte, $("#tabelle"), faktor);
  if (bearbeiten)
    bearbeitbar(document.querySelector(".karte"), karte, { faktor, beiÄnderung: zählen });

  const ablauf = $("#ablauf");
  ablauf.textContent = "";
  for (const p of karte.prep ?? [])
    ablauf.append(kasten("schritt", feld("nummer", "V"), kasten("", feld("verb", p))));
  schritte(karte, faktor).forEach((s, i) => {
    ablauf.append(kasten("schritt",
      feld("nummer", String(i + 1).padStart(2, "0")),
      kasten("", feld("verb", s.text), feld("zutaten", s.zutaten.join(", ")),
        feld("hinweis", s.note ? `↳ ${s.note}` : ""))));
  });

  const zettel = $("#einkauf");
  zettel.textContent = "";
  for (const posten of einkauf(karte, faktor))
    zettel.append(kasten("posten",
      feld("menge", posten.menge),
      kasten("", feld("name", posten.name), feld("qual", posten.qual),
        feld("teile", posten.teile.length ? `in ${posten.teile.length} Schritten: ${posten.teile.join(" + ")}` : ""))));
}

function ansichtZeigen() {
  $("#tabelle").hidden = ansicht !== "tabelle";
  $("#ablauf").hidden = ansicht !== "ablauf";
  $("#einkauf").hidden = ansicht !== "einkauf";
}

function schalten(leiste, gewählt) {
  for (const b of leiste.children) b.setAttribute("aria-pressed", String(b === gewählt));
}

async function laden() {
  try {
    karte = await api.holen(id);
  } catch (fehler) {
    if (fehler.status === 404) return sagen("Diese Karte gibt es nicht (mehr).", true);
    return sagen(`Laden ging nicht: ${fehler.message}`, true);
  }
  gespeichert = JSON.parse(JSON.stringify(karte));
  liste.merken({ id, schlüssel, titel: karte.title });
  zeichnen();
  $("#umschalten").hidden = !schlüssel;
  $("#entfernen").hidden = !schlüssel;
  if (!navigator.onLine)
    sagen("Offline. Diese Karte kommt aus dem Zwischenspeicher, Ändern geht nicht.");
}

$("#menge").addEventListener("click", ereignis => {
  const knopf = ereignis.target.closest("button");
  if (!knopf) return;
  faktor = Number(knopf.dataset.faktor);
  schalten(ereignis.currentTarget, knopf);
  zeichnen();
});

$("#ansicht").addEventListener("click", ereignis => {
  const knopf = ereignis.target.closest("button");
  if (!knopf) return;
  ansicht = knopf.dataset.ansicht;
  schalten(ereignis.currentTarget, knopf);
  ansichtZeigen();
});

$("#drucken").addEventListener("click", () => window.print());

// Objektzutaten tragen Felder, die eine Textzeile nicht hat. Solche Karten
// bleiben beim JSON, statt sie beim Speichern still umzuschreiben.
const alsListe = () => notation.verlustfrei(karte);

function strukturZeigen() {
  $("#quelle").value = alsListe() ? notation.schreibe(karte) : JSON.stringify(karte, null, 2);
  $("#strukturform").textContent = alsListe()
    ? "Eine eingerückte Zeile ist ein Eingang des Punktes darüber. Der letzte Schritt steht oben."
    : "Diese Karte hat Zutaten in Objektform, die eine Liste nicht tragen kann. Deshalb JSON.";
}

function zählen() {
  const n = änderungen(gespeichert, karte);
  $("#zaehler").textContent = beschreibe(n);
  $("#speichern").disabled = n === 0;
}

$("#umschalten").addEventListener("click", () => {
  bearbeiten = !bearbeiten;
  document.body.classList.toggle("bearbeitet", bearbeiten);
  $("#umschalten").textContent = bearbeiten ? "Fertig" : "Bearbeiten";
  $("#speichern").hidden = !bearbeiten;
  $("#verwerfen").hidden = !bearbeiten;
  $("#struktur").hidden = !bearbeiten;
  if (bearbeiten) strukturZeigen();
  else abschalten(document.querySelector(".karte"));
  zeichnen();
  zählen();
});

$("#speichern").addEventListener("click", async () => {
  const fehler = prüfeKarte(karte);
  if (fehler.length) return sagen(fehler.join("; "), true);

  $("#speichern").disabled = true;
  try {
    karte = await api.ersetzen(id, schlüssel, karte);
    gespeichert = JSON.parse(JSON.stringify(karte));
    liste.merken({ id, schlüssel, titel: karte.title });
    zeichnen();
    zählen();
    sagen("Gespeichert.");
  } catch (f) {
    sagen(navigator.onLine ? `Speichern ging nicht: ${f.message}`
                           : "Offline. Änderungen lassen sich erst wieder online speichern.", true);
    $("#speichern").disabled = false;
  }
});

$("#verwerfen").addEventListener("click", () => {
  if (änderungen(gespeichert, karte) === 0) return;
  if (!confirm("Alle Änderungen verwerfen?")) return;
  karte = JSON.parse(JSON.stringify(gespeichert));
  strukturZeigen();
  zeichnen();
  zählen();
  sagen("Auf den gespeicherten Stand zurückgesetzt.");
});

$("#uebernehmen").addEventListener("click", () => {
  const melden = (text, schlecht = false) => {
    const el = $("#strukturmeldung");
    el.textContent = text;
    el.classList.toggle("schlecht", schlecht);
  };
  let entwurf;
  try {
    entwurf = alsListe() ? notation.lies($("#quelle").value) : JSON.parse($("#quelle").value);
  } catch (fehler) {
    return melden(fehler.message, true);
  }
  const fehler = prüfeKarte(entwurf);
  if (fehler.length) return melden(fehler.join("; "), true);
  karte = entwurf;
  melden("Übernommen. Noch nicht gespeichert.");
  strukturZeigen();
  zeichnen();
  zählen();
});

$("#ausgeben").addEventListener("click", () => {
  if (!karte) return sagen("Noch nichts geladen.", true);
  transfer.herunterladen(transfer.dateiname(karte.title), karte);
});

$("#entfernen").addEventListener("click", async () => {
  if (!confirm("Karte endgültig löschen? Alle Links darauf werden ungültig.")) return;
  try {
    await api.löschen(id, schlüssel);
    liste.vergessen(id);
    location.href = "/";
  } catch (fehler) {
    sagen(`Löschen ging nicht: ${fehler.message}`, true);
  }
});

addEventListener("online", () => sagen(""));
addEventListener("offline", () => sagen("Offline. Ändern geht jetzt nicht."));

laden();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
