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

## Rows

Walk the tree depth-first, children in order. Every ingredient appends one row.

This gives the property everything else rests on: **the leaves of a subtree are
always a contiguous block of rows.** No sorting, no collision handling.

A step spans from the first to the last row of its own subtree.

## Columns

```
column(ingredient) = 0
column(step)       = max(column(input) for input in step) + 1
```

Column 0 is the ingredient column; steps start at 1.

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
   width**. A run that gets wider or narrower starts a new rectangle.

Rule 3 matters: a rectangle grown across a change in width would swallow a row
separator that is visible to its left and right, and the line would stop in the
middle of the card.

## Lines

Lines separate, they do not frame.

- Every cell draws its right and its bottom edge; the card frame draws the outer
  top and left. Each line is drawn exactly once.
- A free area draws its bottom edge but **not** its right one: it belongs to the
  entrance of the step beside it and is not separated from it.
- Where a strand ends, the grid ends. Free areas are not filled with a lattice
  of empty fields.

## Around the grid

Above the ingredient rows, in this order, each spanning the full width:

1. notes about the card,
2. preparations,
3. a header row: the word for ingredients, then the column numbers.

The whole grid scrolls sideways as one; the ingredient column scrolls with it.

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
