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
| `  > {Mehl} und {Milch} glatt verrühren` | the step above, said as a sentence. At most one, right under its step |
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

**A sentence says the step as a cook would write it,** and is what the steps
are read out as. The step line stays the short form the table is drawn with and
the timer read from; the sentence is for reading. It names each ingredient of
its step in braces, exactly as the ingredient's line names it, and an amount
stands there in its place, scaled: `{Mehl} und {Milch} glatt verrühren` reads
"250 g Mehl und 500 ml Milch glatt verrühren". What earlier steps made is named
in plain words, `den Teig`. An ingredient the sentence leaves out is read after
it, so no amount is lost, and a brace naming none of the step's ingredients -
one renamed since, say - is read as the plain word. A step without a sentence
is read out as its own line.

**The amount** is everything after the colon: a number and a unit (`250 g`), a
range (`40-60 g`), a count (`2`), or words (`nach Geschmack`). Whatever unit you
write is the unit - `3 Zweige` works like `300 g`. Leave the colon off if there
is no amount.

## Rules a reader follows

1. Split an ingredient at the **first** colon; a bracket at the end of the part
   before it is the remark.
2. After the colon: a leading number or range is the amount, the rest is the
   unit. No leading number means the whole of it is the amount, as words.
3. Numbers are `2`, `2,5` or `2.5`. Ranges are `40-60`. A fraction like `½` is
   read as words, so it does not scale.
4. Anything not matching a `#`, `>`, `*` or `-` line is an error, as is a second
   title, a second outermost line, or indentation that skips a level.
5. A preparation has nothing indented under it, and a step has at least one
   ingredient somewhere below it. Both are errors otherwise.
6. Every line carries text of its own: a step needs a verb, an ingredient a
   name, a preparation something to do. An empty one is an error.
7. A `>` line indented one level under a step, before anything else under it,
   is that step's sentence. A step has at most one; a `>` line indented
   anywhere else is an error. Its text is taken whole: brackets and colons in
   it are words.
