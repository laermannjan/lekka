# Tabular recipe notation - specification v0.4

How a recipe card reads, and how it is derived from a card file. The file itself
is defined in `FORMAT.md`.

---

## 1. Principle

The card is a dataflow graph, not text.

| Element | Meaning |
|---|---|
| **row** | one *use* of an ingredient, not the ingredient itself |
| **column** | a point in time, earlier on the left, later on the right |
| **cell** | one step; its height says which rows flow together there |
| **preparation** | stands above the table and flows nowhere |

Everything else follows. An ingredient used at two places has two rows. A tool
has no row because it does not flow anywhere. A step that merges nothing is
still a cell; it simply spans whatever came out of the previous step.

**Test for every row:** does this go into the pot? If not, it is preparation.
**Test for every cell:** what exactly does it bring together? If nothing, and
the step changes nothing, the cell is superfluous.

## 2. Naming ingredients

Two fields, visually separated (name in text colour, qualifier in grey):

- **name** - what you would put on a shopping list. A noun, no attributes:
  `Wasser`, `Magerquark`, `Körner`, `Haferflocken`.
- **qualifier** - state, choice or alternative: `lauwarm`, `oder Naturjoghurt`,
  `z. B. Sonnenblumen`, `grob`, `frisch`.

Rule of thumb: whatever you would not read out in a shop belongs in the
qualifier.

An amount is a number, a range or a text; a row without an amount leaves the
column empty. Never write "some" - that is not an amount.

## 3. Phrasing steps

After Chu's `mix / bake / cool`:

- **Infinitive, lower case.** `vermengen`, `in Form geben`, `backen`.
- **Verb first.** No article, no subject.
- **Parameters directly on the verb**, temperature before time:
  `backen 200 °C Heißluft 60 min`, `reifen lassen 12 h bei 24 °C`.
- **One step, one verb.** Two verbs mean two cells, unless they are inseparable
  (`einfetten, ausstreuen` on the same tin).
- **Three to five words**, not counting numbers. Anything longer belongs in the
  note.

Recurring verbs, so that cards sound alike: `vermengen · verkneten · falten ·
reifen lassen · gehen lassen · formen · in Form geben · einschneiden · backen ·
stürzen · auskühlen`.

**Notes** sit in grey under the verb. They carry what you must know but do not
do: conditions (`ohne Vorheizen, unterste Schiene`), target state (`bis sich das
Volumen verdoppelt`), interventions during a long step (`nach 10 min längs
einschneiden`). Separate with ordinary punctuation, never with `·` or `|`.

## 4. From tree to grid

The layout is a pure function of the tree. Two passes over it, no search, no
collision handling.

**Rows.** Depth-first traversal, children in order; every leaf appends one row.
A subtree therefore always occupies a contiguous block of rows, which is what
makes the rest work.

**Row span.** A step spans from the first to the last row of its subtree.

**Columns.** A step sits one column to the right of its deepest input:

```
column(step) = max(column(child) for child in inputs) + 1
column(ingredient) = 0
```

**Right alignment.** When several strands merge into one step, the longest
strand decides that step's column; the shorter ones move right until they sit
directly in front of the merge. The whole subtree moves, and since each strand
owns its own rows, nothing can collide.

A column therefore says *when* something is done, not when it could earliest be
done: you grease the tin before filling it, not at the start.

**Free areas.** Cells cover only part of the grid. What remains is merged into
rectangles: a rectangle grows to the right as far as the row is free, then
downwards as long as the free run stays exactly the same width. A run that gets
wider or narrower starts a new rectangle, which keeps the row separator visible
across the whole card.

## 5. Lines

Lines separate; they do not frame.

- Every cell draws its right and its bottom line, the card frame draws the rest.
  Each line is therefore drawn exactly once.
- A free area does **not** draw its right line: it belongs to the entrance of
  the step next to it and is not separated from it.
- Where a strand ends, the grid ends. Free areas are not filled with a grid of
  empty fields.

## 6. Styling tokens

| Token | Value | Role |
|---|---|---|
| Type | IBM Plex Sans, **one** size (14 px) | hierarchy through weight only |
| Weights | 450 body · 600 verbs and preparation · 700 title | |
| Accent | `#1E6B4C` | header, rules, active controls |
| Preparation | `#E6EFE9` | accent, heavily lightened |
| Grey | `#7A7A72` | qualifiers and notes, same shade for both |
| Row height | min. 21 px, 1 px padding | density as in the original |
| Alignment | ingredients left, steps centred | centring shows the merge |

Colour does **not** encode the content of a step. That was tried and dropped:
the effort of classifying was out of proportion to the gain.

## 7. Converting a recipe

1. **List ingredients as uses.** Every mention in the prose is a row, even if
   the same ingredient appears more than once.
2. **Sort rows by where they merge.** Whatever goes into one bowl must be
   adjacent. This, not the order in the original, decides the sequence.
3. **Pull out tools and oven conditions** into preparation or notes.
4. **Condense the verbs.** Each sentence of the original becomes one verb plus
   parameters; the rest moves into the note or is dropped.
5. **Assign columns** by the rule in §4.
6. **Check the side strands.** A preferment is its own block of rows with its
   own columns, merging into the main strand later.
7. **Read it back as a sequence.** If the generated step list reads like a
   recipe, the table is right.

## 8. Example: sourdough with two strands

```
Preparation    Gärkorb bemehlen
Preparation    Ofen mit Topf auf 250 °C vorheizen

Sauerteig      50 g  Anstellgut          ┐
               ..    Mehl                ├ verrühren ─ reifen lassen ..h ┐
               ..    Wasser  lauwarm     ┘                               │
                                                                         ├ verkneten ─ …
Hauptteig      ..    Mehl                ┐                               │
               ..    Wasser              ├───────────── autolysieren ..min ┘
               ..    Salz                ┘
```

The sourdough strand occupies columns 1 and 2 and thereby decides where the
merge sits: column 3. The main dough strand needs only one step. It still does
not sit in column 1 but moves right until it is directly in front of the
kneading, into column 2 - the autolyse does not start the evening before either.

The area that stays free (column 1 next to the main dough) stays free when
drawn: no frame, no line.
