# The .lekka card format

A recipe is a flow: ingredients go into a step, its result goes into the next
step. A card writes that flow down, and it is drawn as a table where **rows are
ingredients and columns are time**.

## A whole card

```
# Pfannkuchen (12 Stück)

- braten (2 min je Seite)
  - verrühren
    - Mehl: 250 g
    - Milch: ½ l
    - Eier: 2
  - schmelzen
    - Butter: 30 g
```

is drawn as

```
250 g  Mehl   ┐
½ l    Milch  ├ verrühren ┐
2      Eier   ┘           │
                          ├ braten
30 g   Butter ─ schmelzen ┘        (2 min je Seite)
```

Two strands, joined by `braten`. You can see in the file what you see in the
table: `verrühren` and `schmelzen` are indented under `braten`, so both flow
into it.

## Reading it

**Indented under a line means: flows into that line.**

From that one rule everything follows:

- A line **with** indented lines under it is a **step**. A line **without** is an
  **ingredient**.
- A step's column is one further right than its inputs. Its height covers all
  the ingredients that reach it.
- The outermost line is the last step, so the file reads bottom-up. The table
  reads left to right.

## Writing it

| Line | Meaning |
|---|---|
| `# Pfannkuchen (12 Stück)` | title, and in brackets what it yields. Exactly one |
| `> made this for Ida's birthday` | a note about the whole card. Any number |
| `* Ofen auf 200 °C vorheizen` | a preparation: something you do that flows nowhere |
| `- verrühren (von Hand)` | a step: verb first, remark in brackets |
| `- Mehl (Type 550): 250 g` | an ingredient: name, remark, then the amount |

Indent by two spaces per level. Blank lines mean nothing.

A preparation may stand at the outermost level, and then it comes before
everything, or be indented under a step, and then it comes before that step. It
is read like any other indented line: what is under a step happens before it. It
simply brings no ingredient with it, so it gets no row.

**A note is a comment; a preparation is an instruction.** `> Sauerteig am
Vorabend` tells you something about the recipe, and `* Ofen auf 200 °C vorheizen`
tells you to do something. They look alike on the page and are not the same kind
of line.

**A preparation is not a step, and could not be one.** A step needs a place on
both axes: its column is `max(column(input)) + 1`, and its height is the rows of
what it gathered. Something that consumes no ingredient has neither. It would
also break the one rule the format rests on, since `-` means *flows into* and
nothing flows out of preheating an oven into baking.

That is what the notation buys: a preparation costs a line of vertical space,
which is free, instead of a column, which is the scarce thing - columns are what
make a card too wide for the screen.

**Brackets always hold the same kind of thing:** the aside. What it yields, how
to do it, which sort of flour.

**The amount** is everything after the colon: a number and a unit (`250 g`), a
range (`40-60 g`), a count (`2`), or words (`nach Geschmack`). Whatever unit you
write is the unit - `3 Zweige` works like `300 g`. Leave the colon off if there
is no amount.

## Rules a reader follows

1. Split an ingredient at the **first** colon; a bracket at the end of the part
   before it is the remark.
2. After the colon: a leading number or range is the amount, the rest is the
   unit. No leading number means the whole of it is the amount, as words.
3. Numbers may be `2`, `2,5`, `½`, `1½`. Ranges are `40-60`.
4. Anything not matching a `#`, `>`, `*` or `-` line is an error, as is a second
   title, a second outermost line, or indentation that skips a level.
5. A preparation has nothing indented under it, and a step has at least one
   ingredient somewhere below it. Both are errors otherwise.
6. Every line carries text of its own: a step needs a verb, an ingredient a
   name, a preparation something to do. An empty one is an error.
