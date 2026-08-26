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
  assert.deepEqual(grid.frees, [
    { row: 1, column: 1, rowSpan: 1, columnSpan: 2, openRight: true },
  ])
})

test('the invariants hold for the sample cards and for random trees', () => {
  const cards = readdirSync('rezepte').map((name) =>
    parseCard(readFileSync(`rezepte/${name}`, 'utf8')),
  )
  for (let seed = 0; seed < 200; seed++) {
    const root = randomNode(random(seed), 0)
    if (root.kind === 'step') cards.push({ root })
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
