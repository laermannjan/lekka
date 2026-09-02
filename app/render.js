import { buildGrid } from './grid.js'
import { formatAmount, scaleAmount } from './amount.js'

const NAME_COLUMN = 3
const UNIT = /(\d)\s+(?=[^\s\d]{1,3}(?:[\s,]|$))/g

/** A card as a table. Column 0 of the grid is the three ingredient columns. */
export function renderCard(card, scale = 1, edit = null) {
  return renderGrid(buildGrid(card), scale, edit)
}

/**
 * Any grid as a table, whole or a slice of one. Split out from `renderCard` because the
 * editor draws a grid it built itself, from several strands, and the walk draws a slice
 * of one; both must go through this code to be the card rather than a picture of it.
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
  // A slice of the card numbers its columns with the places they hold in the whole of
  // it, so the header still says when this is.
  const numbers = grid.numbers ?? Array.from({ length: grid.columns }, (_, index) => index + 1)
  const lead = edit?.onChoose ? 1 : 0
  const put = (node, spec) => place(node, grid, spec, lead)

  /*
   * What takes each ingredient, so its cell can be given the columns it waits through.
   * A step always sits one column after the step that takes it (`place` in `grid.js`
   * hands every child `column - 1`), so a step never waits; only an ingredient does.
   */
  const takenBy = new Map()
  for (const cell of grid.cells)
    for (const child of cell.node.children)
      if (child.kind === 'ingredient') takenBy.set(child, cell.column)
  const pick = (box, node) => {
    if (!edit?.onPick) return box
    box.classList.add('pickable')
    box.onclick = () => edit.onPick(node)
    return box
  }

  const table = element('div', 'grid')
  table.style.setProperty('--columns', grid.columns)
  // Classes, not counts: `repeat(0, …)` is not a valid track list, and a browser that
  // rejects one throws the whole template away and lays the table out in implicit
  // tracks - every cell present, every one the wrong width. A card with no step yet is
  // the first thing every new card is, so this is the common case, not the corner.
  if (lead) table.classList.add('choosing')
  if (grid.columns === 0) table.classList.add('flat')

  const head = grid.band.length
  // The row that adds an ingredient is a row of the table like any other, so it counts
  // towards where the bottom is. Otherwise the rows above it are drawn as the last ones
  // and drop their bottom rule, and the table ends twice.
  const adds = edit?.onAdd ? 1 : 0
  const bottom = head + 1 + grid.rows.length + adds

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

  // The walk puts steps in this column too, so it names it for what it holds.
  const label = element('div', 'label heading', grid.heading ?? 'Ingredient')
  label.style.gridColumn = `${1 + lead} / ${NAME_COLUMN + 1 + lead}`
  label.style.gridRow = String(head + 1)
  table.append(label)
  for (let column = 1; column <= grid.columns; column++)
    table.append(put(element('div', 'label', pad(numbers[column - 1])), {
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
    // name are one line of the card split into three columns, not three things. They sit
    // in a slot of their own, which runs from the ingredient column to whatever takes
    // this ingredient - the free area to its right, drawn as the reach of the cell that
    // is waiting rather than as a rectangle worked out separately.
    const waits = (takenBy.get(node) ?? grid.columns + 1) - 1
    const hold = element('div', 'hold')
    hold.style.gridArea = `${row} / ${1 + lead} / span 1 / span ${NAME_COLUMN + waits}`
    if (last) hold.classList.add('lowest')
    for (const field of ingredientFields(node, scale)) {
      // The reading view hides these a row at a time as steps take them over.
      field.node.dataset.row = String(index)
      area(field.node, field.column, field.columnSpan, 1, 1)
      hold.append(pick(field.node, node))
    }
    table.append(hold)
  })

  /*
   * A step in a slot of its own. The slot is one column wide, which is all a step ever
   * needs, and it is what stops the cell from holding the left edge for the whole card:
   * a sticky cell may not leave its own slot, so the next step pushes it out exactly as
   * it arrives. That is the roll.
   */
  for (const cell of grid.cells) {
    const box = pick(stepField(cell.node), cell.node)
    const holder = element('div', 'holds')
    area(box, 1, 1, 1, 1)
    holder.append(box)
    table.append(put(holder, {
      column: NAME_COLUMN + cell.column, columnSpan: 1,
      row: head + 2 + cell.row, rowSpan: cell.rowSpan,
      last: head + 1 + cell.row + cell.rowSpan === bottom,
    }))
  }

  /*
   * The free rectangles still carry the ink. A cell reaching as far as the step that
   * takes it gives the blank space its shape, but not its edges: where two runs of
   * blank meet and are not the same width, a rule has to be drawn or a line that is
   * visible on both sides of them stops in the middle of the card. That is rule 3 in
   * `LAYOUT.md`, and it is why this cannot be worked out from the cells alone.
   */
  for (const free of grid.frees) {
    const box = element('div', free.into ? 'free open' : 'free')
    table.append(put(box, {
      column: NAME_COLUMN + free.column, columnSpan: free.columnSpan,
      row: head + 2 + free.row, rowSpan: free.rowSpan,
      last: head + 1 + free.row + free.rowSpan === bottom,
    }))
  }

  // Under the last ingredient, where the next one goes. It runs from the very left
  // edge, across the checkboxes, because a row that starts halfway leaves a notch.
  if (adds) {
    const box = element('div', 'add', '+ Ingredient')
    box.onclick = edit.onAdd
    table.append(put(box, {
      column: 0, columnSpan: NAME_COLUMN + lead, row: bottom, rowSpan: 1, last: true,
    }))
    // and the rest of that row, so the table has an edge along its whole width.
    if (grid.columns > 0)
      table.append(put(element('div', 'free'), {
        column: NAME_COLUMN + 1, columnSpan: grid.columns, row: bottom, rowSpan: 1, last: true,
      }))
  }

  // After the last step, where the next one goes. A column of its own, because that is
  // what a step is: the table has to say a step can be added before anybody ticks a row.
  // It runs the full height for the same reason the add row runs the full width.
  if (edit?.onStep) {
    const box = element('div', 'add step', '+ Step')
    box.onclick = edit.onStep
    table.append(put(box, {
      column: NAME_COLUMN + grid.columns + 1,
      columnSpan: 1,
      row: head + 1,
      rowSpan: 1 + grid.rows.length + adds,
      last: true,
    }))
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
