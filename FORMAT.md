# rezeptkarte/1 - the card format

A recipe card is one file. This document defines it completely: first the way
people write it, then the way it is stored.

---

## 1. A card is a tree

A recipe is neither prose nor a table. It is a flow: ingredients go into a step,
and the result of that step goes into the next one. The last step is the root,
the ingredients are the leaves.

The table follows from the tree. One row per ingredient use, one column per
point in time. Whoever writes the tree correctly never has to think about the
table. How the table is derived is defined in `NOTATION.md`.

## 2. The list form

This is how a card is written by hand:

```
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

| Marker | Meaning |
|---|---|
| `#` | title, and after a `\|` the yield. Exactly one line, required |
| `>` | a note about the whole card. Any number |
| `*` | preparation: something you do that flows nowhere |
| `-` | a node of the tree, either a step or an ingredient |
| indent | two spaces per level |

**The only rule: whatever is indented under a node flows into it.** A node with
indented nodes below it is a step, a node without is an ingredient. Nothing else
distinguishes them.

Blank lines carry no meaning and may appear anywhere. Header lines (`#`, `>`,
`*`) may appear in any order, but all of them before the tree.

### Why the last step comes first

The root of the tree is the last step, and a nested list writes the root first.
The list therefore runs backwards to the order of cooking.

This is deliberate. Having both - a plain nested list *and* chronological order
- is not possible without introducing markers for the question of where a
step's inputs end. Chronological order is what the step view and the card
itself provide; the card reads left to right.

## 3. The ingredient line

```
name (qualifier): amount unit
```

Everything before the first colon says what the ingredient is, everything after
says how much. On the right, a leading number is the amount and the remainder is
the unit; if there is no leading number, the whole right side is the amount.
This is why no list of known units is needed.

| Line | amount | unit | name | qualifier |
|---|---|---|---|---|
| `Dinkelmehl: 300 g` | 300 | g | Dinkelmehl | |
| `Hefe (frisch): 1 Würfel` | 1 | Würfel | Hefe | frisch |
| `Wasser (lauwarm): ½ l` | 0.5 | l | Wasser | lauwarm |
| `Wasser: 40-60 g` | 40-60 | g | Wasser | |
| `Rosmarin: 3 Zweige` | 3 | Zweige | Rosmarin | |
| `Eier: 2` | 2 | | Eier | |
| `Salz: Prise` | "Prise" | | Salz | |
| `Pfeffer: nach Geschmack` | "nach Geschmack" | | Pfeffer | |
| `Haferflocken (grob)` | null | | Haferflocken | grob |

**The name** is a noun without attributes: what you would read out in a shop.
**The qualifier** in parentheses carries state, choice or alternative:
`lauwarm`, `oder Naturjoghurt`, `z. B. Sonnenblumen`. Rule of thumb: whatever
you would not read out in a shop belongs in the parentheses.

Four kinds of amount:

| Kind | Example | Scales? | Adds up in the shopping list? |
|---|---|---|---|
| number | `300` | yes | yes |
| range | `40-60` | yes, both ends | yes |
| text | `nach Geschmack`, `Prise` | no | no |
| none | line without a colon | - | - |

Fractions are written `½ ⅓ ⅔ ¼ ¾ ⅕ ⅜ ⅛`, mixed as `1½`, decimals with a comma
(`2,5`). Ranges use a hyphen or an en dash. Stored amounts are always the
unscaled ones; factors apply at display time only.

The split happens at the **first** colon, so a name cannot contain one. The
qualifier is the last parenthesised group at the end of the name; nested
parentheses are not parsed.

## 4. The step line

```
verb parameters | note
```

**The verb** is an infinitive, lower case, first, without article or subject.
Parameters follow directly, temperature before time. Three to five words, not
counting numbers.

**The note** after `|` carries what you need to know but do not do: conditions,
target state, interventions during a long step.

A parenthesised group at the end of the verb is read as a note as well, so
`reifen lassen 12 h (bei 20 °C)` and `reifen lassen 12 h | bei 20 °C` mean the
same. Editing a step normalises the first into the second, otherwise the note
would appear twice.

A step needs at least one input. Two verbs mean two steps unless they are
inseparable: `einfetten, ausstreuen` on the same tin.

## 5. The stored file

Cards are stored as JSON. The list form of §2 is a second view of the same data.

```json
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

| Field | Type | Required |
|---|---|---|
| `schema` | exactly `"rezeptkarte/1"` | yes |
| `title` | non-empty string | yes |
| `step` | step object, the root | yes |
| `yield` | string | no |
| `meta` | array of strings | no |
| `prep` | array of strings | no |
| `id`, `updatedAt` | assigned by the server | no |

**A step** is `{ "do": string, "note": string?, "in": [...] }`. `in` needs at
least one entry; each entry is either a step or an ingredient.

**An ingredient** is either a string as in §3, or an object:

```json
{ "name": "Haferflocken", "amount": null, "unit": "", "qual": "grob" }
```

`amount` is a number, a range `{ "von": 40, "bis": 60 }`, a string, or `null`.
The object form can carry fields a text line cannot; such cards cannot be edited
through the list form.

Unknown fields are preserved. Anyone who puts their own data into a card does
not lose it on save.

## 6. Guarantees

A parser and a writer for this format must satisfy:

1. **Round trip.** `read(write(card))` equals `card`, and `write(read(text))`
   equals `write(read(write(read(text))))` - writing is idempotent.
2. **One representation per card.** The writer emits exactly one spelling for
   any given card, so saving an untouched card does not change the file.
3. **Preservation.** Fields the format does not define survive a round trip
   through the JSON. They do not survive the list form.
4. **Order.** The order of `in` is the order the rows appear in, top to bottom.
   It is data, not presentation: it decides which ingredients end up adjacent.

## 7. Errors

Parsing a list either yields a card or fails with a message naming the line.

| Message | Cause |
|---|---|
| no title line | no line starting with `#` |
| no tree | only header lines |
| line N: unknown line marker | text without a leading marker |
| line N: second root | two nodes at the outermost level |
| line N: indentation matches no step | indentation that skips or misses a level |
| step without inputs | a step whose `in` is empty |

## 8. Deliberately missing

1. **Ingredient identity.** Equal ingredients are grouped by name. A reference
   per line would only be needed once the same ingredient appears under
   different names in one card, or across different units.
2. **Non-scaling amounts**, for lines such as `Hefe: 1 Würfel` that do not grow
   linearly when the recipe is doubled.
3. **Duration per step** as its own field, so a schedule could be computed
   backwards from the time you want to cut the loaf. Today the time sits inside
   the verb and is text. For sourdough this is the point where a card could do
   more than paper.
