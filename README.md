# Lekka

Tabellarische Rezeptkarten. Ein Node-Prozess ohne Laufzeit-Abhängigkeiten,
eine Karte je Datei, offline lesbar.

- [FORMAT.md](FORMAT.md) erklärt das Kartenformat `.lekka`: wie eine Karte
  geschrieben und gelesen wird.
- [ARCHITECTURE.md](ARCHITECTURE.md) beschreibt, wie die App funktioniert:
  Teilen über Links, Ablage, Bearbeiten, Offline, und was bewusst fehlt.
- [NOTATION.md](NOTATION.md) definiert, wie daraus eine Karte wird: Zeilen,
  Spalten, Linien, und die Regeln für Verben und Zutatennamen.

## Rechte hängen am Link

Es gibt keine Konten, keine Anmeldung und kein Cookie. Wer eine Karte anlegt,
bekommt zwei Links:

| Link | Kann |
|---|---|
| `/r/<id>` | lesen |
| `/r/<id>/<schlüssel>` | lesen und ändern |

Dasselbe Modell wie bei [Nuudel/Framadate](https://nuudel.digitalcourage.de),
wo die Verwaltung ebenfalls an einem geheimen Pfad hängt. Der Link bleibt in
der Adresszeile stehen: man sieht jederzeit, was man in der Hand hat, ein
Lesezeichen behält seine Rechte, und Neuladen ändert nichts.

Gespeichert wird serverseitig nur der SHA-256 des Schlüssels. Beim Ändern
schickt die App ihn als Kopfzeile `X-Edit-Key`.

Wer den Bearbeitungslink weitergibt, gibt das Recht zum Ändern weiter. Wer ihn
verliert, kann die Karte nur noch lesen. Ein geheimer Pfad steht in Browser-
verlauf und Zugriffslog; `Referrer-Policy: no-referrer` verhindert, dass er
beim Klick nach außen mitgeht.

## Übersicht und Geräte

Der Server kennt keine Nutzer und kann seine Karten nicht auflisten - sonst
wäre der geheime Link wertlos. Die Übersicht auf `/` ist deshalb die Liste der
Links, die *auf diesem Gerät* angelegt oder geöffnet wurden, im `localStorage`.

Auf ein zweites Gerät kommt eine Karte über ihren Link. Für ein Umzugs- oder
Sicherungspaket: „Alle exportieren“ schreibt ein Bündel mit allen Karten und
Schlüsseln, „Importieren“ liest es wieder ein. Karten, die es auf dem Server
noch gibt, werden dabei nur wieder verknüpft; verlorene werden neu angelegt
und bekommen neue Links.

Einzelne Karten lassen sich als `rezeptkarte/1` aus- und einlesen, damit sie
auch außerhalb dieser App brauchbar sind.

## Karten im Repo

`rezepte/` enthält die Karten als Vorlagen, nicht als Bestand: sie liegen im
Git, damit die Notation Beispiele hat und `layout()` an echten Rezepten
geprüft wird. In die App kommen sie über „Importieren".

Angelegt wird jedes Mal eine Kopie mit eigenen Links. Ändert man sie in der
App, ändert sich die Vorlage im Repo nicht.

## Offline

Der Service Worker legt die App und jede geöffnete Karte ab. Ohne Netz lassen
sich bekannte Karten lesen; Änderungen weist die App mit einem Hinweis ab,
statt sie in eine Warteschlange zu legen. Der Server bleibt die einzige
Quelle, damit zwei Geräte am selben Bearbeitungslink nie auseinanderlaufen.

## Entwicklung

Toolchain und Aufgaben über [mise](https://mise.jdx.dev):

```bash
mise install                 # Node und Abhängigkeiten
mise run dev                 # http://localhost:8080
mise run test                # einmal
mise run watch               # im Watch-Modus
```

```bash
mise run e2e                 # Rechte im echten Browser (Chromium)
```

Die Unittests decken Raster, Prüfung, Liste und API ab. `e2e/` prüft, was nur
ein Browser beantworten kann: ob man die Bearbeitung auch wirklich *sieht*.
Der Anlass war eine CSS-Regel, die `[hidden]` überstimmte - die Knöpfe waren
sichtbar, während `element.hidden` korrekt `true` meldete und jsdom die
Kaskade dafür nicht nachbildet.

`mise tasks` listet alles auf. Die Aufgaben installieren die Abhängigkeiten
bei Bedarf, `mise run dev` genügt also nach dem Klonen. Im Betrieb liegen die
Karten unter `$DATA_DIR`, in der Entwicklung in `data/` neben dem Quelltext.

## Aufbau

```
app/      alles, was der Browser bekommt
  layout.js    Rezeptbaum → Raster (der Kern, siehe NOTATION.md)
  validate.js  Prüfung gegen rezeptkarte/1, läuft auch im Server
  liste.js     die Links dieses Geräts
server/   HTTP und Ablage, eine Karte je Datei
schema/   rezeptkarte-1.schema.json, die maßgebliche Beschreibung
```

`app/validate.js` ist von Hand geschrieben, damit Server und Browser dieselbe
Prüfung ohne Abhängigkeit teilen. `test/validate.test.js` hält sie mit dem
JSON-Schema deckungsgleich.

## Betrieb

```bash
mise run up                  # http://localhost:8380
mise run down
mise run logs
```

Die Karten liegen im Volume `karten` unter `/data`; sonst ist das Dateisystem
des Containers schreibgeschützt. **Dieses Volume sichern** - es gibt keine
zweite Kopie, und mit ihm verschwinden alle Links.

## HTTPS

Der Service Worker verlangt einen sicheren Kontext. Ohne HTTPS läuft die Seite,
ist aber weder offline verfügbar noch installierbar. Hinter einen Reverse Proxy
mit Zertifikat hängen; `localhost` gilt als sicher und funktioniert zum Testen.

## Aktualisieren

Nichts zu tun. Die Cache-Version des Service Workers ist der Hash von `app/`,
den der Server beim Ausliefern einsetzt: geänderte Datei, neue Version, Clients
holen sich die neue Fassung. Wer `app/` ohne diesen Server ausliefert, bekommt
die feste Version `lekka-dev` und muss sich selbst darum kümmern.
