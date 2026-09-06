import test from 'node:test'
import assert from 'node:assert/strict'

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { install, all, byClass } from './dom.js'

const body = install()
globalThis.location = { origin: 'https://kitchen.example' }
const { renderOverview } = await import('../app/overview.js')

const cells = (box) => all(box).find(byClass('records')).children
const text = (node) => all(node).map((child) => child.own).join(' ')

/**
 * The table is a CSS grid of three columns, so it is laid out by the *count* of cells:
 * emit two per row and every row after the first is scrambled. That is exactly what
 * broke when a column went once before, so it is what this holds down.
 */
test('every row is three cells, because the grid is three columns', () => {
  const box = renderOverview(
    [
      { id: 'a-1111111111', scope: 'owner', card: { title: 'Erdkruste' } },
      { id: 'b-2222222222', scope: 'read', card: { title: 'Dinkelquarkbrot' } },
    ],
    { onDelete: () => {}, onCreate: () => {} },
  )
  body.replaceChildren(box)

  const row = cells(box)
  assert.deepEqual(
    row.slice(0, 3).map((cell) => cell.own),
    ['Recipe', 'Hold', 'Delete'],
    'the heading is one row of three',
  )
  // Nine cells in threes, then the row that grows the table, which spans all of them.
  assert.equal(row.length, 10)
  assert.equal(row.at(-1).className, 'add')
  assert.equal(row.slice(0, -1).length % 3, 0, 'everything above it is whole rows')
})

/**
 * What you hold, on every row, in the three words the foot uses for the recipe you are
 * standing in. Where nothing is owned anywhere no scope comes back and everybody owns
 * everything, which is what the last row here is.
 */
test('each row says what is held on it, as a tag', () => {
  const box = renderOverview(
    [
      { id: 'a-1111111111', scope: 'owner', card: { title: 'Mine' } },
      { id: 'b-2222222222', scope: 'edit', card: { title: 'Shared' } },
      { id: 'c-3333333333', scope: 'read', card: { title: 'Lent' } },
      { id: 'd-4444444444', card: { title: 'Nobody owns anything here' } },
    ],
    { onDelete: () => {} },
  )
  body.replaceChildren(box)

  const tags = all(box).filter(byClass('tag'))
  assert.deepEqual(
    tags.map((one) => one.textContent),
    ['owner', 'collaborator', 'read-only', 'owner'],
  )
  // The same pale blue the foot draws it in, which is what the class buys.
  assert.ok(tags.every((one) => one.className === 'tag scope'))
})

test('one column when there is nothing to do to any of them', () => {
  const box = renderOverview([{ id: 'a-1111111111', card: { title: 'Erdkruste' } }])
  body.replaceChildren(box)
  assert.ok(all(box).some((node) => node.className === 'records reading'))
  assert.deepEqual(
    cells(box).map((cell) => cell.own),
    ['Recipe', ''],
    'a heading and one name, one cell each',
  )
})

test('Delete is offered only where it would work', () => {
  const box = renderOverview(
    [
      { id: 'a-1111111111', scope: 'owner', card: { title: 'Mine' } },
      { id: 'b-2222222222', scope: 'edit', card: { title: 'Shared' } },
      { id: 'c-3333333333', scope: 'read', card: { title: 'Lent' } },
      { id: 'd-4444444444', card: { title: 'Nobody owns anything here' } },
    ],
    { onDelete: () => {} },
  )
  body.replaceChildren(box)

  assert.equal(all(box).filter(byClass('danger')).length, 2, 'the owned one and the unowned one')
  // The cell is empty on the other two. It used to say "shared with you" and "read only",
  // which the Hold column now says about every row instead of about the two it refuses.
  assert.doesNotMatch(text(box), /shared with you|read only/)
})

test('an empty table still fills its row', () => {
  const box = renderOverview([], { onDelete: () => {} })
  body.replaceChildren(box)
  const row = cells(box)
  assert.equal(row.length, 3 + 3, 'heading, then "no recipes" and the cells beside it')
  assert.match(text(box), /No recipes yet/)
})

/**
 * The one that would have caught it. `.records` is a grid, so a row is laid out by the
 * *count* of cells rather than by any markup saying "row" - emit three into a
 * two-column grid and every row after the first is shifted by one. Nothing in the
 * renderer can see the stylesheet, and nothing in the stylesheet can see the renderer,
 * so the number they agree on is only ever checked here.
 */
test('the stylesheet and the renderer agree on how many columns there are', async () => {
  const css = await readFile(fileURLToPath(new URL('../app/style.css', import.meta.url)), 'utf8')

  const columns = (selector) => {
    const rule = new RegExp(`\\${selector}\\s*\\{[^}]*grid-template-columns:([^;]+);`).exec(css)
    assert.ok(rule, `${selector} sets grid-template-columns`)
    return rule[1].trim().split(/\s+(?![^(]*\))/).length
  }

  const wide = renderOverview([{ id: 'a-1111111111', scope: 'owner', card: { title: 'A' } }], {
    onDelete: () => {},
  })
  body.replaceChildren(wide)
  assert.equal(cells(wide).length % columns('.records'), 0, 'the full table divides evenly')

  const narrow = renderOverview([{ id: 'a-1111111111', card: { title: 'A' } }])
  body.replaceChildren(narrow)
  assert.equal(cells(narrow).length % columns('.records.reading'), 0, 'and so does the read-only one')
})
