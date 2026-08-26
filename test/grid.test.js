import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

import { parseCard } from '../app/card.js'
import { buildGrid } from '../app/grid.js'

const PANCAKES = parseCard(`# Pfannkuchen

- braten
  - verrühren
    - Mehl: 250 g
    - Milch: 500 ml
    - Eier: 2
  - schmelzen
    - Butter: 30 g
`)

test('rows follow the leaves, in order', () => {
  const { rows, columns } = buildGrid(PANCAKES)
  assert.deepEqual(
    rows.map((row) => row.name),
    ['Mehl', 'Milch', 'Eier', 'Butter'],
  )
  assert.equal(columns, 2)
})

test('a step spans its own leaves and sits in front of the merge', () => {
  const { cells } = buildGrid(PANCAKES)
  const by = (verb) => cells.find((cell) => cell.node.verb === verb)

  assert.deepEqual(pick(by('braten')), { column: 2, row: 0, rowSpan: 4 })
  assert.deepEqual(pick(by('verrühren')), { column: 1, row: 0, rowSpan: 3 })
  assert.deepEqual(pick(by('schmelzen')), { column: 1, row: 3, rowSpan: 1 })
})

test('a short strand is pushed right, leaving a free area in front of it', () => {
  const grid = buildGrid(
    parseCard(`# A

- c
  - b
    - a
      - Mehl: 1
  - Wasser: 1
`),
  )
  const cells = Object.fromEntries(grid.cells.map((cell) => [cell.node.verb, pick(cell)]))
  assert.deepEqual(cells, {
    c: { column: 3, row: 0, rowSpan: 2 },
    b: { column: 2, row: 0, rowSpan: 1 },
    a: { column: 1, row: 0, rowSpan: 1 },
  })
  assert.deepEqual(
    grid.frees.map(({ into, ...free }) => ({ ...free, into: into.node.verb })),
    [{ row: 1, column: 1, rowSpan: 1, columnSpan: 2, into: 'c' }],
  )
})

test('a strand shorter than its sibling is pushed right, with its subtree', () => {
  const grid = buildGrid(
    parseCard(`# A

- smoke
  - refrigerate
    - rub
      - remove
        - Ribs: 2
      - Rub: 1
  - heat
    - soak
      - Chips: 2
`),
  )
  const columns = Object.fromEntries(grid.cells.map((cell) => [cell.node.verb, cell.column]))
  assert.deepEqual(columns, {
    smoke: 4,
    refrigerate: 3,
    rub: 2,
    remove: 1,
    heat: 3,
    soak: 2,
  })
})

test('preparations sit over the step they precede, packed into band rows', () => {
  const { band, columns } = buildGrid(
    parseCard(`# A
* Kohle kaufen

- glasieren
  * Grill direkt heizen
  - räuchern
    * Grill indirekt heizen
    - Rippen: 2
  - Sauce: 1
`),
  )
  assert.equal(columns, 2)
  assert.deepEqual(
    band.map((row) => row.map((entry) => [entry.node.text, entry.column, entry.columnSpan])),
    [
      [['Kohle kaufen', 0, 3]],
      [
        ['Grill indirekt heizen', 1, 1],
        ['Grill direkt heizen', 2, 1],
      ],
    ],
  )
})

test('a free area is split where the step beside it changes', () => {
  const { frees } = buildGrid(
    parseCard(`# A

- smoke
  - rub
    - remove
      - Ribs: 1
    - Rub: 1
  - soak
    - Chips: 1
`),
  )
  assert.deepEqual(
    frees.map(({ into, ...free }) => ({ ...free, into: into.node.verb })),
    [
      { row: 1, column: 1, rowSpan: 1, columnSpan: 1, into: 'rub' },
      { row: 2, column: 1, rowSpan: 1, columnSpan: 1, into: 'soak' },
    ],
  )
})

test('the invariants hold for the sample cards and for random trees', () => {
  const cards = readdirSync('test/cards').map((name) =>
    parseCard(readFileSync(`test/cards/${name}`, 'utf8')),
  )
  for (let seed = 0; seed < 200; seed++) {
    const root = randomNode(random(seed), 0)
    if (root.kind === 'step') cards.push({ root, preparations: [] })
  }

  for (const card of cards) checkInvariants(buildGrid(card))
})

function checkInvariants({ rows, cells, frees, columns }) {
  const fields = rows.map(() => new Array(columns).fill(0))

  for (const area of [...cells, ...frees]) {
    assert.ok(area.rowSpan > 0 && area.row >= 0 && area.row + area.rowSpan <= rows.length)
    assert.ok(area.column >= 1 && area.column + area.columnSpan - 1 <= columns)
    for (let row = area.row; row < area.row + area.rowSpan; row++)
      for (let column = area.column; column < area.column + area.columnSpan; column++)
        fields[row][column - 1]++
  }

  for (const row of fields) for (const count of row) assert.equal(count, 1)

  for (let row = 0; row < rows.length; row++)
    assert.ok(cells.some((cell) => cell.row <= row && row < cell.row + cell.rowSpan))
}

function pick({ column, row, rowSpan }) {
  return { column, row, rowSpan }
}

function random(seed) {
  let state = seed * 2654435761 + 1
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

function randomNode(next, depth) {
  if (depth > 3 || next() < 0.35)
    return { kind: 'ingredient', name: 'x', aside: null, amount: null }
  const children = []
  for (let count = 1 + Math.floor(next() * 3); count > 0; count--)
    children.push(randomNode(next, depth + 1))
  return { kind: 'step', verb: 'v', aside: null, children }
}
