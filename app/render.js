import { buildGrid } from './grid.js'
import { formatAmount, scaleAmount } from './amount.js'

const NAME_COLUMN = 3

/** A card as a table. Column 0 of the grid is the three ingredient columns. */
export function renderCard(card, scale = 1) {
  const grid = buildGrid(card)
  const table = element('div', 'grid')
  table.style.setProperty('--columns', grid.columns)

  const head = grid.band.length
  const bottom = head + 1 + grid.rows.length

  grid.band.forEach((entries, index) => {
    const ends = new Set(entries.map((entry) => entry.column + entry.columnSpan - 1))
    for (const entry of entries) {
      const box = element('div', 'preparation', entry.node.text)
      if (ends.has(entry.column - 1)) box.classList.add('joined')
      if (entry.column === 0) {
        box.style.gridColumn = '1 / -1'
        box.style.gridRow = String(index + 1)
      } else area(box, NAME_COLUMN + entry.column, entry.columnSpan, index + 1, 1)
      table.append(box)
    }
  })

  const label = element('div', 'label', 'Ingredient')
  label.style.gridColumn = `1 / ${NAME_COLUMN + 1}`
  label.style.gridRow = String(head + 1)
  table.append(label)
  for (let column = 1; column <= grid.columns; column++)
    table.append(place(element('div', 'label', String(column).padStart(2, '0')), grid, {
      column: NAME_COLUMN + column, columnSpan: 1, row: head + 1, rowSpan: 1,
    }))

  grid.rows.forEach((node, index) => {
    const row = head + 2 + index
    const last = row === bottom
    for (const field of ingredientFields(node, scale))
      table.append(place(field.node, grid, { ...field, row, rowSpan: 1, last }))
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

function ingredientFields(node, scale) {
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
  cell.append(element('div', 'verb', node.verb))
  if (node.aside) cell.append(element('div', 'note', node.aside))
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

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
