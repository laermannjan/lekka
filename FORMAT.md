# Recipe card format

One card is one UTF-8 text file.

## Lines

| Start | Line is | Count |
|---|---|---|
| `# ` | title, optionally `\| yield` | exactly 1 |
| `> ` | note about the card | 0..n |
| `* ` | preparation | 0..n |
| `- ` | node of the tree | 1..n |
| empty | ignored | anywhere |

Header lines (`#`, `>`, `*`) come before the first `-` line, in any order.
Leading and trailing whitespace of a line's content is stripped.

## Tree

Nodes are indented by two spaces per level.

- A node indented under another node is an **input** of it.
- A node **with** children is a **step**, a node **without** children is an
  **ingredient**. There is no other marker.
- Exactly one node sits at the outermost level, and it must be a step. It is the
  last step of the recipe.

```
# Dinkelquarkbrot | 1 Kastenbrot
* Kastenform 30 cm einfetten

- backen 200 °C Heißluft 60 min | ohne Vorheizen
  - in Form geben
    - vermengen | von Hand
      - Dinkelmehl: 300 g
      - Wasser (lauwarm): ½ l
    - ausstreuen
      - Haferflocken (grob)
```

## Step line

```
verb | note
```

`note` is optional. A parenthesised group at the end of `verb` is a note too, so
`reifen lassen 12 h (bei 20 °C)` equals `reifen lassen 12 h | bei 20 °C`. A
writer emits the `|` form.

## Ingredient line

```
name (qualifier): amount unit
```

`(qualifier)` and `: amount unit` are optional. Splitting rules, in order:

1. Split at the **first** `:`. Left is name and qualifier, right is the quantity.
   No colon means no quantity.
2. On the left, a parenthesised group at the **end** is the qualifier. Nested
   parentheses are not parsed.
3. On the right, if the first word is a number or a range, it is the amount and
   the remainder is the unit. Otherwise the whole right side is the amount, as
   text, and there is no unit.

| Line | amount | unit | name | qualifier |
|---|---|---|---|---|
| `Dinkelmehl: 300 g` | 300 | g | Dinkelmehl | |
| `Hefe (frisch): 1 Würfel` | 1 | Würfel | Hefe | frisch |
| `Wasser (lauwarm): ½ l` | 0.5 | l | Wasser | lauwarm |
| `Wasser: 40-60 g` | 40 to 60 | g | Wasser | |
| `Eier: 2` | 2 | | Eier | |
| `Salz: Prise` | text `Prise` | | Salz | |
| `Haferflocken (grob)` | none | | Haferflocken | grob |

**Numbers.** Digits with `,` or `.` as decimal separator (`2,5`), the fractions
`½ ⅓ ⅔ ¼ ¾ ⅕ ⅜ ⅛`, or an integer followed by a fraction (`1½`).

**Ranges.** Two numbers separated by `-` or `–`. Both ends must be numbers,
otherwise the value is text.

**Amounts** are stored unscaled. A number and a range scale; a text does not.

## Grammar

```
card       = header* node
header     = "# " title [ "|" yield ] | "> " text | "* " text
node       = indent "- " content newline child*
child      = node indented by two more spaces
content    = step | ingredient
step       = verb [ "|" note ]
ingredient = name [ "(" qualifier ")" ] [ ":" [ amount ] [ unit ] ]
amount     = number | number ("-" | "–") number | text
number     = digits [ ("," | ".") digits ] | fraction | digits fraction
```

## Rejected

A reader rejects and names the line; it never guesses.

- no `#` line, or more than one
- no `-` line
- a non-empty line starting with none of `#`, `>`, `*`, `-`
- more than one node at the outermost level
- the outermost node has no children
- indentation deeper than the previous node's level plus one

Anything else is content and is taken as written.

---

`NOTATION.md` defines how a card is laid out as a table.
