# Tabellarische Rezeptnotation — Spezifikation v0.3

Arbeitsstand aus der Dinkelquarkbrot-Karte. Gilt als Referenz für weitere Karten
und als Grundlage für das Datenmodell der App.

---

## 1. Grundprinzip

Die Karte ist ein Datenflussgraph, kein Text.

| Element | Bedeutung |
|---|---|
| **Zeile** | eine *Verwendung* einer Zutat — nicht die Zutat selbst |
| **Spalte** | ein Zeitpunkt im Ablauf, links früher, rechts später |
| **Zelle** | ein Schritt; ihre Höhe sagt, welche Zeilen dabei zusammenfließen |
| **Vorbereitung** | steht als Zeile über der Tabelle, fließt nirgends ein |

Daraus folgt alles Weitere. Eine Zutat, die an zwei Stellen einfließt, hat zwei
Zeilen. Ein Utensil hat keine Zeile, weil es nicht einfließt. Ein Schritt ohne
Zusammenführung ist trotzdem eine Zelle, sie spannt dann eben nur über das,
was aus dem vorherigen Schritt kommt.

**Prüffrage für jede Zeile:** kommt das in den Topf? Wenn nein → Vorbereitung.
**Prüffrage für jede Zelle:** was genau führt sie zusammen? Wenn nichts und der
Schritt nichts verändert → sie ist überflüssig.

---

## 2. Zutaten benennen

Zwei Felder, visuell getrennt (Name in Textfarbe, Zusatz in Grau):

- **`name`** — was auf dem Einkaufszettel steht. Ein Substantiv, keine Attribute.
  `Wasser`, `Magerquark`, `Körner`, `Haferflocken`
- **`qual`** — alles, was den Zustand, die Auswahl oder die Alternative angibt.
  `lauwarm`, `oder Naturjoghurt`, `z. B. Sonnenblumen`, `grob`, `frisch`

Merkregel: Wenn du es im Laden nicht vorlesen würdest, gehört es in `qual`.

**Eine Zutat schreibt sich `Name (Zusatz): Menge Einheit`.** Vor dem ersten
Doppelpunkt steht, was sie ist, danach, wieviel:

```
Dinkelmehl: 300 g
Hefe (frisch): 1 Würfel
Rosmarin: 3 Zweige
Pfeffer: nach Geschmack
Haferflocken (grob)
```

Rechts ist die führende Zahl die Menge und alles Weitere die Einheit. Steht dort
keine Zahl, ist alles zusammen die Menge - deshalb braucht es keine Liste
bekannter Einheiten, und `3 Zweige` funktioniert wie `300 g`. Fehlt die Menge,
fällt der Doppelpunkt weg.

Eine Menge ist eine Zahl (`300`), eine Spanne (`40-60`), ein Text
(`nach Geschmack`) oder nichts. Zahl und Spanne werden beim Skalieren
mitgerechnet und im Einkauf zusammengezählt, ein Text bleibt stehen, wie er ist.

---

## 3. Duktus der Schritte

Nach Chus `mix / bake / cool`, ins Deutsche übertragen:

- **Infinitiv, klein geschrieben.** `vermengen`, `in Form geben`, `backen`
- **Verb zuerst.** Kein „Den Teig …“, kein Artikel, kein Subjekt.
- **Parameter direkt am Verb**, in fester Reihenfolge *Temperatur → Zeit*:
  `backen 200 °C Heißluft 60 min`, `reifen lassen 12 h bei 24 °C`
- **Ein Schritt, ein Verb.** Zwei Verben heißen zwei Zellen — es sei denn, sie
  sind untrennbar (`einfetten, ausstreuen` an derselben Form).
- **Drei bis fünf Wörter**, Zahlen zählen nicht mit. Wird es länger, gehört
  der Rest in den Hinweis.

Wiederkehrende Verben, damit Karten untereinander gleich klingen:
`vermengen · verkneten · falten · reifen lassen · gehen lassen · formen ·
in Form geben · einschneiden · backen · stürzen · auskühlen`

### Hinweise

Grau unter dem Verb. Sie tragen, was man wissen muss, aber nicht tut:

- Bedingungen (`ohne Vorheizen, unterste Schiene`)
- Zielzustand (`Teig bleibt weich`, `bis sich das Volumen verdoppelt`)
- Eingriffe während eines langen Schritts (`nach 10 min längs einschneiden`)

Trennung durch normale Interpunktion. Komma für Aufzählungen, Punkt, wenn zwei
verschiedene Dinge gemeint sind. Keine Trennzeichen wie `·` oder `|`.

---

## 4. Styling-Tokens

| Token | Wert | Rolle |
|---|---|---|
| Schrift | IBM Plex Sans, **eine** Größe (14 px) | Hierarchie nur über Gewicht |
| Gewichte | 450 Fließtext · 600 Verben und Vorbereitung · 700 Titel | |
| Akzent | `#1E6B4C` | Kopfzeile, Raster, aktive Bedienelemente, Änderungen |
| Vorbereitung | `#E6EFE9` | Akzent stark aufgehellt |
| Grau | `#7A7A72` | Qualifier und Hinweise — dieselbe Abstufung für beide |
| Zeilenhöhe | min. 21 px, 1 px Innenabstand | Dichte wie im Original |
| Ausrichtung | Zutaten links, Schritte zentriert | Zentrierung zeigt den Zusammenfluss |

Linien trennen, sie umranden nicht. Jede Zelle zieht ihre rechte und ihre
untere Linie, der Rahmen der Karte den Rest; so wird jede Linie genau einmal
gezeichnet. Eine Fläche ohne Schritt zieht ihre rechte Linie nicht: sie gehört
zum Eingang des Schritts rechts daneben und ist von ihm nicht getrennt. Solche
Flächen werden zu möglichst großen Rechtecken zusammengefasst, sonst stünde
dort ein Gitter aus lauter leeren Feldern.

Farbe kodiert **nicht** den Inhalt der Schritte. Das war ein Versuch und ist
verworfen: der Aufwand der Einordnung stand nicht im Verhältnis zum Ertrag.

---

## 5. Datenmodell

```jsonc
{
  "title": "Dinkelquarkbrot",
  "yield": "1 Kastenbrot",
  "prep":  [ { "text": "Kastenform 30 cm einfetten" } ],
  "rows":  [ { "amount": 300, "unit": "g", "name": "Dinkelmehl", "qual": "" } ],
  "cells": [ { "col": 1, "row": 0, "span": 8, "colspan": 1,
               "text": "vermengen", "note": "von Hand, Teig bleibt weich" } ]
}
```

- `row` ist der Index der ersten Zutatenzeile, `span` die Anzahl Zeilen.
- `col` beginnt bei 1 (Spalte 0 sind die Zutaten).
- `amount: null` heißt „ohne Menge“, nicht „null“.
- Skalierung wirkt auf `amount`; die gespeicherten Werte sind immer 1×.

### Offene Punkte für die App

1. **`ref` pro Zeile** — eine Zutaten-ID statt Gruppierung über den Namen.
   Erst damit funktioniert die Einkaufsansicht bei unterschiedlich benannten
   Verwendungen und über Einheitengrenzen hinweg.
2. **`scalable: false`** für Zeilen wie „1 Würfel Hefe“, die beim Verdoppeln
   nicht linear mitwachsen sollen.
3. **Zeitfeld pro Zelle** (`duration`), damit sich ein Zeitplan rückwärts vom
   gewünschten Anschnitt rechnen lässt. Bei Sauerteigen ist das der Punkt, an
   dem die Karte mehr kann als Papier.

---

## 5a. Die Karte als Liste

Dasselbe Rezept als Text, für alle, die lieber tippen als klicken. Keine eigene
Sprache, sondern eine verschachtelte Liste, deren Verschachtelung genau die des
Baums ist:

```
# Dinkelquarkbrot | 1 Kastenbrot
* Kastenform 30 cm einfetten

- backen 200 °C Heißluft 60 min | ohne Vorheizen, unterste Schiene
  - in Form geben
    - vermengen | von Hand, Teig bleibt weich
      - 300 g Dinkelmehl
      - 100 g Körner (z. B. Sonnenblumen)
    - ausstreuen | in die gefettete Form
      - Haferflocken (grob)
```

| Zeichen | Bedeutung |
|---|---|
| `#` | Titel, nach `\|` der Ertrag |
| `>` | Anmerkung zur ganzen Karte |
| `*` | Vorbereitung |
| `-` | ein Punkt des Baums |
| `\|` | trennt Verb und Hinweis |

Die einzige Regel: **was eingerückt unter einem Punkt steht, fließt in ihn
hinein.** Ein Punkt mit eingerückten Punkten darunter ist ein Schritt, ein Punkt
ohne ist eine Zutat.

Die Wurzel steht oben, der letzte Schritt also zuerst. Das ist die Ordnung des
Baums und nicht die des Kochens; chronologisch liest man die Ansicht „Ablauf"
oder die Karte selbst, die von links nach rechts läuft. Der Versuch, beides
zugleich zu haben, kostet Sonderzeichen für die Frage, wo die Eingänge eines
Schritts nach oben aufhören - und die sind teurer als die Umkehrung.

## 6. Ein Rezept überführen — Arbeitsablauf

1. **Zutaten als Verwendungen auflisten.** Jede Nennung im Fließtext ist eine
   Zeile, auch wenn dieselbe Zutat mehrfach vorkommt.
2. **Zeilen nach Zusammenfluss sortieren.** Was gemeinsam in eine Schüssel
   geht, muss benachbart stehen. Das bestimmt die Reihenfolge, nicht die
   Reihenfolge im Original.
3. **Utensilien und Ofenbedingungen herausziehen** → Vorbereitung oder Hinweis.
4. **Verben verdichten.** Jeder Satz des Originals wird zu einem Verb plus
   Parametern; der Rest wandert in den Hinweis oder fällt weg.
5. **Spalten zuweisen.** Ein Schritt steht eine Spalte rechts von dem Schritt,
   auf dessen Ergebnis er wartet. Münden mehrere Stränge in einen Schritt, gibt
   der längste die Spalte vor; die kürzeren rücken nach rechts, bis sie direkt
   vor der Zusammenführung stehen. Eine Spalte sagt damit, wann man etwas tut,
   und nicht, wann man es frühestens könnte: die Form fettet man vor dem
   Einfüllen, nicht zu Beginn.
6. **Nebenstränge prüfen.** Ein Vorteig ist ein eigener Block von Zeilen mit
   eigenen Spalten, der später in den Hauptstrang mündet.
7. **Gegenlesen im Ablauf.** Wenn die generierte Schrittliste sich wie ein
   Rezept liest, stimmt die Tabelle.

---

## 7. Beispiel: Sauerteigbrot mit zwei Strängen

Struktur der Erdkruste, wie sie in die Karte fällt — Mengen und Zeiten aus
deiner angepassten Variante fehlen noch:

```
Vorbereitung   Gärkorb bemehlen
Vorbereitung   Ofen mit Topf auf 250 °C vorheizen

Sauerteig      50 g  Anstellgut       ┐
               ..    Mehl             ├ verrühren ─ reifen lassen ..h ┐
               ..    Wasser  lauwarm  ┘                               │
                                                                      ├ verkneten ─ …
Hauptteig      ..    Mehl             ┐                               │
               ..    Wasser           ├─────────── autolysieren ..min ┘
               ..    Salz             ┘
```

Der Sauerteigstrang belegt Spalten 1 und 2 und gibt damit vor, wo die
Zusammenführung liegt: in Spalte 3. Der Hauptteigstrang braucht nur einen
Schritt. Er steht trotzdem nicht in Spalte 1, sondern rückt nach rechts bis
direkt vor das Verkneten, in Spalte 2. Die Autolyse beginnt ja auch nicht am
Vorabend, sondern kurz bevor der Sauerteig reif ist.

Genau dafür ist die Notation gemacht, und genau das sieht man in Marcel Paas
Fließtext nicht.

Die Fläche, die dabei frei bleibt (Spalte 1 auf Höhe des Hauptteigs), bleibt
auch beim Zeichnen frei: kein Rahmen, keine Linie. Wo ein Strang endet, hört
das Raster auf.

Was ich von dir brauche, um das auszufüllen: die Mengen deiner 50-g-Variante,
die Reifezeit des Sauerteigs, ob du mit Autolyse arbeitest, die Stock- und
Stückgarezeiten und dein Backprogramm (Temperatur fallend? mit Dampf? Topf?).
