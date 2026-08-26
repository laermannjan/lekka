# rezeptkarte/1 — das Dateiformat

Eine Rezeptkarte ist eine Datei. Dieses Dokument beschreibt sie vollständig:
erst so, wie man sie schreibt, dann so, wie sie gespeichert wird.

Jede vollständige Beispielkarte in diesem Text wird von `test/format.test.js`
eingelesen und geprüft, ebenso jede Zeile der Tabelle in §3. Was hier steht,
kann also nicht veralten, ohne dass die Tests rot werden.

---

## 1. Eine Karte ist ein Baum

Ein Rezept ist kein Text und keine Tabelle, sondern ein Fluss: Zutaten fließen
in einen Schritt, dessen Ergebnis in den nächsten. Der letzte Schritt ist die
Wurzel, die Zutaten sind die Blätter.

Die Tabelle entsteht daraus von selbst - eine Zeile je Zutat, eine Spalte je
Zeitpunkt. Wer den Baum richtig aufschreibt, muss sich um die Tabelle nicht
kümmern.

## 2. Die Karte als Liste

So schreibt man eine Karte von Hand:

```karte
# Dinkelquarkbrot | 1 Kastenbrot
* Kastenform 30 cm einfetten

- backen 200 °C Heißluft 60 min | ohne Vorheizen, unterste Schiene
  - in Form geben
    - vermengen | von Hand, Teig bleibt weich
      - Dinkelmehl: 300 g
      - Körner (z. B. Sonnenblumen): 100 g
      - Wasser (lauwarm): ½ l
    - ausstreuen | in die gefettete Form
      - Haferflocken (grob)
```

| Zeichen | Bedeutung |
|---|---|
| `#` | Titel; nach `\|` der Ertrag. Genau eine Zeile, sie muss da sein |
| `>` | Anmerkung zur ganzen Karte. Beliebig viele |
| `*` | Vorbereitung: etwas, das man tut, das aber nirgends einfließt |
| `-` | ein Punkt des Baums, Schritt oder Zutat |
| Einrückung | zwei Leerzeichen je Ebene |

**Die einzige Regel: was eingerückt unter einem Punkt steht, fließt in ihn
hinein.** Ein Punkt mit eingerückten Punkten darunter ist ein Schritt, ein Punkt
ohne ist eine Zutat. Mehr unterscheidet die beiden nicht.

Leerzeilen bedeuten nichts und dürfen überall stehen.

### Warum der letzte Schritt oben steht

Die Wurzel des Baums ist der letzte Schritt, und eine verschachtelte Liste
schreibt die Wurzel zuerst. Die Liste läuft damit rückwärts zur Kochreihenfolge.

Das ist Absicht. Beides zugleich - Liste **und** chronologisch - geht nicht,
ohne Sonderzeichen für die Frage einzuführen, wo die Eingänge eines Schritts
nach oben aufhören. Chronologisch liest man die Ansicht „Ablauf" oder die Karte
selbst, die von links nach rechts läuft.

## 3. Die Zutatenzeile

```
Name (Zusatz): Menge Einheit
```

Vor dem ersten Doppelpunkt steht, was die Zutat ist, danach, wieviel. Rechts ist
die führende Zahl die Menge und alles Weitere die Einheit; steht dort keine
Zahl, ist alles zusammen die Menge. Deshalb braucht es keine Liste bekannter
Einheiten.

```karte
# Was in einer Zutatenzeile stehen darf
- vermengen
  - Dinkelmehl: 300 g
  - Hefe (frisch): 1 Würfel
  - Wasser (lauwarm): ½ l
  - Wasser: 40-60 g
  - Rosmarin: 3 Zweige
  - Eier: 2
  - Salz: Prise
  - Pfeffer: nach Geschmack
  - Haferflocken (grob)
```

| Zeile | Menge | Einheit | Name | Zusatz |
|---|---|---|---|---|
| `Dinkelmehl: 300 g` | 300 | g | Dinkelmehl | |
| `Hefe (frisch): 1 Würfel` | 1 | Würfel | Hefe | frisch |
| `Wasser (lauwarm): ½ l` | 0,5 | l | Wasser | lauwarm |
| `Wasser: 40-60 g` | 40–60 | g | Wasser | |
| `Rosmarin: 3 Zweige` | 3 | Zweige | Rosmarin | |
| `Eier: 2` | 2 | | Eier | |
| `Salz: Prise` | Prise | | Salz | |
| `Pfeffer: nach Geschmack` | nach Geschmack | | Pfeffer | |
| `Haferflocken (grob)` | | | Haferflocken | grob |

**Der Name** ist ein Substantiv ohne Attribute - was auf dem Einkaufszettel
steht. **Der Zusatz** in Klammern trägt Zustand, Auswahl oder Alternative:
`lauwarm`, `oder Naturjoghurt`, `z. B. Sonnenblumen`. Merkregel: was du im Laden
nicht vorlesen würdest, gehört in die Klammer.

**Vier Arten von Menge:**

| Art | Beispiel | skaliert? | zählt im Einkauf? |
|---|---|---|---|
| Zahl | `300` | ja | ja |
| Spanne | `40-60` | ja, an beiden Enden | ja |
| Text | `nach Geschmack`, `Prise` | nein | nein |
| keine | Zeile ohne Doppelpunkt | – | – |

Brüche gehen als `½ ⅓ ⅔ ¼ ¾ ⅕ ⅜ ⅛`, gemischt als `1½`, Dezimalzahlen mit Komma
(`2,5`). Gespeichert wird immer die einfache Menge; `½×` bis `2×` rechnen erst
beim Anzeigen.

Getrennt wird am **ersten** Doppelpunkt. Ein Name mit Doppelpunkt darin geht
also nicht.

## 4. Die Schrittzeile

```
Verb Parameter | Hinweis
```

```karte
# Was in einer Schrittzeile stehen darf
- backen 250 °C 15 min, dann fallend 190 °C | vorgeheizt, Kerntemperatur 96 °C
  - reifen lassen 12 h (bei 20 °C)
    - Anstellgut (reif): 50 g
```

**Das Verb** steht im Infinitiv, klein, zuerst, ohne Artikel und Subjekt.
Parameter folgen direkt, in der Reihenfolge Temperatur, dann Zeit. Drei bis fünf
Wörter, Zahlen zählen nicht mit.

**Der Hinweis** nach `|` trägt, was man wissen muss, aber nicht tut:
Bedingungen, Zielzustand, Eingriffe während eines langen Schritts.

Eine Klammer am Ende des Verbs wird ebenfalls als Hinweis gelesen
(`reifen lassen 12 h (bei 20 °C)`). Sobald jemand den Schritt bearbeitet,
wandert sie in ein eigenes Feld - sonst stünde sie doppelt da.

Ein Schritt braucht mindestens einen Eingang. Zwei Verben heißen zwei Schritte,
es sei denn, sie sind untrennbar: `einfetten, ausstreuen` an derselben Form.

## 5. Die Datei

Gespeichert wird JSON. Die Liste aus §2 ist eine zweite Ansicht derselben Daten;
beide Richtungen sind verlustfrei, solange alle Zutaten Text sind.

```karte-json
{
  "schema": "rezeptkarte/1",
  "title": "Dinkelquarkbrot",
  "yield": "1 Kastenbrot",
  "meta": ["Quelle: »Mein Tipp«, S. 32"],
  "prep": ["Kastenform 30 cm einfetten"],
  "step": {
    "do": "backen 200 °C Heißluft 60 min",
    "note": "ohne Vorheizen, unterste Schiene",
    "in": [
      { "do": "vermengen",
        "in": ["Dinkelmehl: 300 g", "Wasser (lauwarm): ½ l"] },
      { "do": "ausstreuen", "in": ["Haferflocken (grob)"] }
    ]
  }
}
```

| Feld | Typ | Pflicht |
|---|---|---|
| `schema` | genau `"rezeptkarte/1"` | ja |
| `title` | Text, nicht leer | ja |
| `step` | Schritt, die Wurzel | ja |
| `yield` | Text | nein |
| `meta` | Liste von Texten | nein |
| `prep` | Liste von Texten | nein |
| `id`, `updatedAt` | vergibt der Server | nein |

**Ein Schritt** ist `{ "do": Text, "note": Text?, "in": [ … ] }`. `in` braucht
mindestens einen Eintrag; jeder ist entweder ein Schritt oder eine Zutat.

**Eine Zutat** ist entweder ein Text wie in §3 oder ein Objekt:

```jsonc
{ "name": "Haferflocken", "amount": null, "unit": "", "qual": "grob" }
```

`amount` ist eine Zahl, eine Spanne `{ "von": 40, "bis": 60 }`, ein Text oder
`null`. Die Objektform trägt Felder, die eine Textzeile nicht hat; solche Karten
lassen sich nicht als Liste bearbeiten, und die App zeigt dafür JSON.

Unbekannte Felder bleiben erhalten. Wer eigene Angaben in eine Karte schreibt,
verliert sie beim Speichern nicht.

Maßgeblich für Maschinen ist `schema/rezeptkarte-1.schema.json`.
`app/validate.js` prüft dasselbe ohne Abhängigkeiten, und
`test/validate.test.js` hält beide über 25 Fälle deckungsgleich.

## 6. Wenn etwas nicht stimmt

| Meldung | Ursache |
|---|---|
| `Es fehlt eine Titelzeile, die mit # anfängt` | keine `#`-Zeile |
| `Es fehlt der Baum: eine Zeile, die mit - anfängt` | nur Kopfzeilen |
| `Zeile N: fängt mit keinem der Zeichen # > * - an` | Text ohne führendes Zeichen |
| `Zeile N: zweite Wurzel, es gibt nur einen letzten Schritt` | zwei Punkte ganz links |
| `Zeile N: Einrückung passt zu keinem Schritt` | krumme Einrückung |
| `step.in[0]: in braucht mindestens ein Element` | Schritt ohne Eingang |

## 7. Was absichtlich fehlt

1. **Zutaten-Identität.** Gleiche Zutaten werden über ihren Namen gruppiert.
   Eine `ref` je Zeile bräuchte es erst, wenn dieselbe Zutat in einer Karte
   verschieden heißt oder die Einheiten sich unterscheiden.
2. **`scalable: false`** für Zeilen wie `Hefe: 1 Würfel`, die beim Verdoppeln
   nicht linear mitwachsen.
3. **Dauer je Schritt** als eigenes Feld, damit sich ein Zeitplan rückwärts vom
   gewünschten Anschnitt rechnen lässt. Heute steckt die Zeit im Verb und ist
   nur Text. Bei Sauerteigen ist das der Punkt, an dem die Karte mehr könnte
   als Papier.
