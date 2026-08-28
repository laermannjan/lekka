import { buildGrid } from './grid.js'
import { formatAmount, scaleAmount } from './amount.js'

const NAME_COLUMN = 3
const UNIT = /(\d)\s+(?=[^\s\d]{1,3}(?:[\s,]|$))/g

/** A card as a table. Column 0 of the grid is the three ingredient columns. */
export function renderCard(card, scale = 1) {
  return renderGrid(buildGrid(card), scale)
}

/**
 * Any grid as a table, whole or a slice of one. A slice numbers its columns with the
 * places they hold in the card, not with 01, so the header still says when this is.
 */
export function renderGrid(grid, scale = 1) {
  const numbers = grid.numbers ?? Array.from({ length: grid.columns }, (_, index) => index + 1)
  const table = element('div', 'grid')
  table.style.setProperty('--columns', grid.columns)

  const head = grid.band.length
  const bottom = head + 1 + grid.rows.length

  grid.band.forEach((entries, index) => {
    const ends = new Set(entries.map((entry) => entry.column + entry.columnSpan - 1))
    for (const entry of entries) {
      const box = preparationField(entry.node)
      if (ends.has(entry.column - 1)) box.classList.add('joined')
      if (entry.column === 0) {
        box.style.gridColumn = '1 / -1'
        box.style.gridRow = String(index + 1)
      } else area(box, NAME_COLUMN + entry.column, entry.columnSpan, index + 1, 1)
      table.append(box)
    }
  })

  // The walk puts steps in this column too, so it names it for what it holds.
  const label = element('div', 'label heading', grid.heading ?? 'Ingredient')
  label.style.gridColumn = `1 / ${NAME_COLUMN + 1}`
  label.style.gridRow = String(head + 1)
  table.append(label)
  for (let column = 1; column <= grid.columns; column++)
    table.append(place(element('div', 'label', pad(numbers[column - 1])), grid, {
      column: NAME_COLUMN + column, columnSpan: 1, row: head + 1, rowSpan: 1,
    }))

  grid.rows.forEach((node, index) => {
    const row = head + 2 + index
    const last = row === bottom
    for (const field of ingredientFields(node, scale)) {
      // The walk hides these a row at a time as steps take them over.
      field.node.dataset.row = String(index)
      table.append(place(field.node, grid, { ...field, row, rowSpan: 1, last }))
    }
  })

  for (const cell of grid.cells)
    table.append(place(stepField(cell.node), grid, {
      column: NAME_COLUMN + cell.column, columnSpan: 1,
      row: head + 2 + cell.row, rowSpan: cell.rowSpan,
      last: head + 1 + cell.row + cell.rowSpan === bottom,
    }))

  for (const free of grid.frees) {
    const box = element('div', free.into ? 'free open' : 'free')
    table.append(place(box, grid, {
      column: NAME_COLUMN + free.column, columnSpan: free.columnSpan,
      row: head + 2 + free.row, rowSpan: free.rowSpan,
      last: head + 1 + free.row + free.rowSpan === bottom,
    }))
  }

  return table
}

function pad(number) {
  return String(number).padStart(2, '0')
}

function preparationField(node) {
  const box = element('div', 'preparation', bind(node.text))
  if (node.aside) box.append(element('span', 'aside', bind(node.aside)))
  return box
}

function ingredientFields(node, scale) {
  // A slice can put a step where ingredients go, standing for everything it consumed.
  if (node.kind === 'step') {
    const box = element('div', 'carried', node.verb)
    if (node.aside) box.append(element('span', 'aside', node.aside))
    return [{ node: box, column: 1, columnSpan: NAME_COLUMN }]
  }

  const amount = scaleAmount(node.amount, scale)
  const name = element('div', 'name')
  name.append(element('span', 'noun', node.name))
  if (node.aside) name.append(element('span', 'aside', node.aside))

  if (amount?.kind === 'words')
    return [
      { node: element('div', 'words', amount.text), column: 1, columnSpan: 2 },
      { node: name, column: NAME_COLUMN, columnSpan: 1 },
    ]

  return [
    { node: element('div', 'amount', amount ? formatAmount({ ...amount, unit: '' }) : ''), column: 1, columnSpan: 1 },
    { node: element('div', 'unit', amount?.unit ?? ''), column: 2, columnSpan: 1 },
    { node: name, column: NAME_COLUMN, columnSpan: 1 },
  ]
}

function stepField(node) {
  const cell = element('div', 'step')
  cell.append(element('div', 'verb', bind(node.verb)))
  if (node.aside) cell.append(element('div', 'note', bind(node.aside)))
  return cell
}

function place(node, grid, { column, columnSpan, row, rowSpan, last }) {
  area(node, column, columnSpan, row, rowSpan)
  if (column + columnSpan - 1 === NAME_COLUMN + grid.columns) node.classList.add('rightmost')
  if (last) node.classList.add('lowest')
  return node
}

function area(node, column, columnSpan, row, rowSpan) {
  node.style.gridArea = `${row} / ${column} / span ${rowSpan} / span ${columnSpan}`
}

function bind(text) {
  return text.replace(UNIT, '$1\u00a0')
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
