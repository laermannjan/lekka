import test from 'node:test'
import assert from 'node:assert/strict'

import { parseCard } from '../app/card.js'
import { buildGrid, frontierAt, timeline } from '../app/grid.js'

const PANCAKES = buildGrid(
  parseCard(`# Pfannkuchen

- braten (2 min je Seite)
  - verrühren
    - Mehl: 250 g
    - Milch: 500 ml
    - Eier: 2
  - schmelzen
    - Butter: 30 g
`),
)

/** Butter waits in the ingredient column while the other strand is kneaded and rested. */
const WAITING = buildGrid(
  parseCard(`# A

- backen
  - ruhen
    - kneten
      - Mehl: 500 g
  - Butter: 30 g
`),
)

const holding = (grid, column) =>
  frontierAt(grid, column).map((band) => ({
    what: band.node.verb ?? band.node.name,
    row: band.row,
    rowSpan: band.rowSpan,
  }))

test('one stop of the walk per column', () => {
  assert.deepEqual(timeline(PANCAKES), [1, 2])
  assert.deepEqual(timeline(WAITING), [1, 2, 3])
})

test('before anything has run, every row holds its own ingredient', () => {
  assert.deepEqual(holding(PANCAKES, 1), [
    { what: 'Mehl', row: 0, rowSpan: 1 },
    { what: 'Milch', row: 1, rowSpan: 1 },
    { what: 'Eier', row: 2, rowSpan: 1 },
    { what: 'Butter', row: 3, rowSpan: 1 },
  ])
})

/**
 * The rule the walk rests on: a step that has run stands on exactly the rows it took, so
 * the column can say what is on the counter without anything moving up or down to say it.
 */
test('a step that has run stands on the rows it consumed', () => {
  assert.deepEqual(holding(PANCAKES, 2), [
    { what: 'verrühren', row: 0, rowSpan: 3 },
    { what: 'schmelzen', row: 3, rowSpan: 1 },
  ])
})

test('an ingredient nothing has reached yet keeps its row', () => {
  // Butter is used at the last column, so it holds row 1 the whole way there.
  assert.deepEqual(holding(WAITING, 1), [
    { what: 'Mehl', row: 0, rowSpan: 1 },
    { what: 'Butter', row: 1, rowSpan: 1 },
  ])
  assert.deepEqual(holding(WAITING, 2), [
    { what: 'kneten', row: 0, rowSpan: 1 },
    { what: 'Butter', row: 1, rowSpan: 1 },
  ])
  assert.deepEqual(holding(WAITING, 3), [
    { what: 'ruhen', row: 0, rowSpan: 1 },
    { what: 'Butter', row: 1, rowSpan: 1 },
  ])
})

/** Nothing may be lost or drawn twice, or the pinned column would not line up. */
test('the bands cover every row of the table exactly once, at every stop', () => {
  for (const grid of [PANCAKES, WAITING])
    for (const column of timeline(grid)) {
      const covered = frontierAt(grid, column).flatMap((band) =>
        Array.from({ length: band.rowSpan }, (_, index) => band.row + index),
      )
      assert.deepEqual(
        covered.sort((one, other) => one - other),
        grid.rows.map((_, row) => row),
        `column ${column}`,
      )
    }
})

test('a strand that merges late is held by its own step, not by the merge', () => {
  const grid = buildGrid(
    parseCard(`# A

- verrühren
  - reifen
    - Anstellgut: 50 g
  - Wasser: 250 g
  - Salz: 8 g
`),
  )

  assert.deepEqual(holding(grid, 2), [
    { what: 'reifen', row: 0, rowSpan: 1 },
    { what: 'Wasser', row: 1, rowSpan: 1 },
    { what: 'Salz', row: 2, rowSpan: 1 },
  ])
})

test('a card without steps has nothing standing', () => {
  assert.deepEqual(frontierAt({ root: null, cells: [], rows: [] }, 1), [])
})
