import { buildGrid } from './grid.js'
import { formatAmount, scaleAmount } from './amount.js'

const NAME_COLUMN = 3
const UNIT = /(\d)\s+(?=[^\s\d]{1,3}(?:[\s,]|$))/g

/** A card as a table. Column 0 of the grid is the three ingredient columns. */
export function renderCard(card, scale = 1, edit = null) {
  return renderGrid(buildGrid(card), scale, edit)
}

/**
 * Any grid as a table. Split out from `renderCard` because the editor draws a grid it
 * built itself, from several strands, and must go through the same code to be the card.
 *
 * `edit` is what makes the table editable, and it is all the editor needs the drawing to
 * give it. Layout keeps, for every row and every cell, the node it came from; handing
 * that node back on a click is the whole back-reference, so the editor never has to work
 * out from a position in the DOM what was clicked.
 *
 *   `onPick(node)`     a cell was tapped
 *   `onChoose(...)`    draw a column of checkboxes down the left, and report a change
 *   `onAdd()`          draw a row under the last ingredient that adds one
 *
 * With `onChoose` the whole table shifts one column right to make room. Without it there
 * is no such column and every position is what it always was, so the card is drawn by
 * exactly the same arithmetic as before.
 */
export function renderGrid(grid, scale = 1, edit = null) {
  const lead = edit?.onChoose ? 1 : 0
  const put = (node, spec) => place(node, grid, spec, lead)
  const pick = (box, node) => {
    if (!edit?.onPick) return box
    box.classList.add('pickable')
    box.onclick = () => edit.onPick(node)
    return box
  }

  const table = element('div', 'grid')
  table.style.setProperty('--columns', grid.columns)
  // A class, not a variable: `repeat(0, …)` is not a track list every browser accepts.
  if (lead) table.classList.add('choosing')

  const head = grid.band.length
  const bottom = head + 1 + grid.rows.length

  grid.band.forEach((entries, index) => {
    const ends = new Set(entries.map((entry) => entry.column + entry.columnSpan - 1))
    for (const entry of entries) {
      const box = pick(preparationField(entry.node), entry.node)
      if (ends.has(entry.column - 1)) box.classList.add('joined')
      if (entry.column === 0) {
        box.style.gridColumn = '1 / -1'
        box.style.gridRow = String(index + 1)
      } else area(box, NAME_COLUMN + entry.column, entry.columnSpan, index + 1, 1, lead)
      table.append(box)
    }
  })

  const label = element('div', 'label', 'Ingredient')
  label.style.gridColumn = `${1 + lead} / ${NAME_COLUMN + 1 + lead}`
  label.style.gridRow = String(head + 1)
  table.append(label)
  for (let column = 1; column <= grid.columns; column++)
    table.append(put(element('div', 'label', pad(column)), {
      column: NAME_COLUMN + column, columnSpan: 1, row: head + 1, rowSpan: 1,
    }))

  // The whole strand at once, since choosing every row of it is what says "this strand".
  if (lead) {
    const on = grid.rows.length > 0 && grid.rows.every((node) => edit.chosen(node))
    const all = choice(on)
    all.onclick = () => edit.onChoose(grid.rows, !on, false)
    table.append(put(all, { column: 0, columnSpan: 1, row: head + 1, rowSpan: 1 }))
  }

  grid.rows.forEach((node, index) => {
    const row = head + 2 + index
    const last = row === bottom
    if (lead) {
      const one = choice(edit.chosen(node))
      // Shift extends from the last row touched, which is how a run of rows is chosen.
      one.onclick = (event) => edit.onChoose([node], !edit.chosen(node), event?.shiftKey === true)
      table.append(put(one, { column: 0, columnSpan: 1, row, rowSpan: 1, last }))
    }
    // Every field of a row leads to the same ingredient: the amount, the unit and the
    // name are one line of the card split into three columns, not three things.
    for (const field of ingredientFields(node, scale))
      table.append(put(pick(field.node, node), { ...field, row, rowSpan: 1, last }))
  })

  for (const cell of grid.cells)
    table.append(put(pick(stepField(cell.node), cell.node), {
      column: NAME_COLUMN + cell.column, columnSpan: 1,
      row: head + 2 + cell.row, rowSpan: cell.rowSpan,
      last: head + 1 + cell.row + cell.rowSpan === bottom,
    }))

  for (const free of grid.frees) {
    const box = element('div', free.into ? 'free open' : 'free')
    table.append(put(box, {
      column: NAME_COLUMN + free.column, columnSpan: free.columnSpan,
      row: head + 2 + free.row, rowSpan: free.rowSpan,
      last: head + 1 + free.row + free.rowSpan === bottom,
    }))
  }

  // Under the last ingredient, where the next one goes.
  if (edit?.onAdd) {
    const box = element('div', 'add', '+ Ingredient')
    box.onclick = edit.onAdd
    area(box, 1, NAME_COLUMN, bottom + 1, 1, lead)
    table.append(box)
  }

  // After the last step, where the next one goes. A column of its own, because that is
  // what a step is: the table has to say a step can be added before anybody ticks a row.
  if (edit?.onStep) {
    const box = element('div', 'add step', '+ Step')
    box.onclick = edit.onStep
    area(box, NAME_COLUMN + grid.columns + 1, 1, head + 1, 1 + grid.rows.length, lead)
    table.append(box)
  }

  return table
}

/**
 * A checkbox in a cell of its own, so that tapping a row still opens the row. The box
 * itself takes no pointer events (`style.css`); the cell around it is the target, which
 * is what makes it big enough to hit.
 */
function choice(on) {
  const box = element('div', 'choose')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = on
  input.tabIndex = -1
  box.append(input)
  return box
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

function place(node, grid, { column, columnSpan, row, rowSpan, last }, lead = 0) {
  area(node, column, columnSpan, row, rowSpan, lead)
  if (column + columnSpan - 1 === NAME_COLUMN + grid.columns) node.classList.add('rightmost')
  if (last) node.classList.add('lowest')
  return node
}

function area(node, column, columnSpan, row, rowSpan, lead = 0) {
  node.style.gridArea = `${row} / ${column + lead} / span ${rowSpan} / span ${columnSpan}`
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
