# From card to table

How a `.lekka` card becomes a grid. Structure only; colours and type are in
`STYLE.md`.

## What the table is

| Element | Is |
|---|---|
| row | one **use** of an ingredient, not the ingredient |
| column | a point in time, earlier left, later right |
| cell | one step; its height says which rows flow together there |

An ingredient used twice has two rows. A tool has no row, because nothing flows
from it. A step that merges nothing is still a cell; it spans whatever came out
of the step before.

A **row** holds amount, unit, name and qualifier, in four fields. A **cell**
holds a verb and a note. Both come from one line of the card, split by the rules
in `FORMAT.md`; the grid holds them apart because the columns need them apart.

Amounts in the grid are the ones written in the card. Scaling multiplies them on
the way to the screen, never in the grid.

## Rows

Walk the tree depth-first, children in order. Every ingredient appends one row.

This gives the property everything else rests on: **the leaves of a subtree are
always a contiguous block of rows.** No sorting, no collision handling.

A step spans from the first to the last row of its own subtree.

## The ingredient column

Column 0 is not one column but three: amount, unit, then name with its
qualifier. Each is as wide as the widest thing in it and no wider. A track is
one width for the whole table, so the names still line up down the card.

The amount and unit fields exist even when empty, otherwise the name slides left
into their place and the column stops lining up. One exception: an amount that
is words rather than a number takes the amount **and** unit fields together, and
then the unit field is not laid out at all - an empty field beside a spanning
one collides and pushes the name onto a second line.

## Columns

```
column(ingredient) = 0
column(step)       = max(column(input) for input in step) + 1
```

Column 0 is the ingredient column; steps start at 1. A step occupies exactly one
column and never spans two - only free rectangles are ever wider than one
column.

**Right alignment.** When several strands merge, the longest one decides the
merging step's column. The shorter ones move right until they sit directly in
front of the merge - the whole subtree moves at once. Since each strand owns its
own rows, moving cannot collide with anything.

A column therefore says *when* something is done, not the earliest it could be
done. You grease the tin before filling it, not at the start.

## Free areas

Cells cover only part of the grid. What is left over is merged into rectangles:

1. Start at the top-left free field.
2. Grow **right** while the fields in this row are free.
3. Grow **down** while the free run in the next row is **exactly the same
   width** and runs into **the same step**. A run that gets wider or narrower,
   or that ends at a different step, starts a new rectangle.

Rule 3 matters twice. A rectangle grown across a change in width would swallow a
row separator that is visible to its left and right, and the line would stop in
the middle of the card. A rectangle grown across a change of step would be the
entrance to two steps at once, and neither the separator between them nor the
one in the ingredient column beside it could be drawn.

## Lines

Lines separate, they do not frame. Every boundary between two neighbouring
fields carries exactly one line, and the grid is closed on the outside.

One exception, and it matters: **a free rectangle has no line towards the step
on its right.** Every rectangle runs into exactly one step, by rule 3 above, so
it is that step's entrance and is not separated from it. The step's own edge is
therefore drawn only along the rows it does not take its input from.

Free areas are not filled with a lattice of empty fields; where a strand ends,
the grid is simply blank.

## Around the grid

Above the ingredient rows, in this order:

1. the **preparations**, each a tag over the column of the step it comes before,
   packed into as few rows as will hold them: two on the same step need two
   rows, two on different steps share one.
2. a **header row**: a label over the ingredient column, then the columns
   numbered from `01`.

**Every preparation is over the column it comes before**, and above the line that
names that column, because that is when it happens. A preparation belonging to
the recipe is the same thing said about the first step there is, so it stands
over the ingredient block - which is what comes before every column there is.

The column is worked out when the table is drawn and never stored. That answers
the objection this arrangement was once dropped for: a column is
`max(column(input)) + 1` and moves whenever a step is inserted upstream, so a
preparation *bound* to a column would silently move to a different moment - but
one bound to its step moves with the step, which is where it belongs.

**Done is as wide as what is standing in it.** A row is drawn from the ingredient
column to the step that takes it, and it holds the left edge for exactly that
long, because a sticky cell cannot leave its own row. So the rows still standing
once a column is done are the rows taken *after* it, and the Done place needs the
width of the widest of those - never more than the ingredient block, never less
than the step whose right edge comes to rest on the line.

It was the whole block whenever any row still waited anywhere on the card. That
block is as wide as the longest name there is, so a card down to one short row
held a lane of nothing open for it: on `roggenquarkbrot` at 1040 px, 379 px of
Done for a row that wanted 231. A standing row is held to that width as the card
rolls, which cuts nothing, because the width was measured from the row.

**Free area belongs to the step it flows into.** A step's cell stands at the right
of the rows it takes, and the blank those rows wait in reaches back under them:
together they make an **L**, and an L is one shape. It takes one colour, it lights
up at once, and it is one target. Half an L shaded is what this looked like when
the blank was left out.

A row is its three cells and stops there. It is pointed at by them and shaded
over them, and it does not reach into the blank - the blank is not the row's, it
is the space the row is standing in while it waits.

A preparation is deliberately not a step. A step needs a column and a height, and
something that consumes no ingredient has neither; making one would also make
`-` mean *flows into* everywhere except there. Keeping it apart costs a line of
vertical space, which is free, rather than a column, which is the scarce thing on
this table.

Notes about the recipe do **not** go into the grid, and neither does what it
yields. They describe the whole recipe rather than a point in it, so they belong
to the specification under the table.

Step columns are as wide as what stands in them, up to 240 px; each of the three
ingredient columns takes exactly what its own content needs. Nothing in the table
is a fixed width - a number that grows when the recipe is scaled has to have
somewhere to grow. The whole grid scrolls
sideways as one.

## Example

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

```
          │ column 1    │ column 2
──────────┼─────────────┼──────────
Mehl      │             │
Milch     │ verrühren   │
Eier      │             │ braten
Butter    │ schmelzen   │
```

`verrühren` spans rows 0 to 2, `schmelzen` row 3, and `braten` all four. Both
strands sit in column 1: `schmelzen` has one input, so its earliest column is 1
and right alignment leaves it there, directly in front of the merge.

## Invariants

A layout is wrong unless all of these hold:

- no two cells cover the same field
- every cell's rows are contiguous and inside the grid
- every row is covered by at least one cell
- cells plus free rectangles cover the grid exactly once
