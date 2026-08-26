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

Wie eine Zutatenzeile geschrieben wird, steht in [FORMAT.md §3](FORMAT.md).

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

Eine Karte ist ein Baum: der letzte Schritt ist die Wurzel, die Zutaten sind die
Blätter, und das Raster entsteht daraus. Felder, Typen und die Textform stehen
in [FORMAT.md](FORMAT.md) und werden dort von Tests festgehalten - dieses
Dokument beschreibt die Notation, jenes die Datei.

---

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
