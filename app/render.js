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
 *   `onChoose(...)`    a row was chosen, or a run of them
 *   `onAdd()`          draw a row under the last ingredient that adds one
 *
 * Choosing happens on the row itself - shift-click with a mouse, a long press with a
 * thumb - rather than in a column of checkboxes down the left. A column that exists only
 * while writing is a column the card has to make room for, and on a phone that is eight
 * per cent of the screen spent on a control used only when building a step.
 */
export function renderGrid(grid, scale = 1, edit = null) {
  // A slice of the card numbers its columns with the places they hold in the whole of
  // it, so the header still says when this is.
  const numbers = grid.numbers ?? Array.from({ length: grid.columns }, (_, index) => index + 1)
  const put = (node, spec) => place(node, grid, spec)

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

  /*
   * A row is chosen on the row itself, not in a column of checkboxes: hold to take one,
   * shift to take the run from the last one touched. A plain tap still opens the row,
   * which is what a tap on a cell has always meant, so the three never collide.
   */
  const choosable = (box, node) => {
    if (!edit?.onChoose) return pick(box, node)
    box.classList.add('pickable')
    // A press that has already chosen the row must not also open it on the way up.
    let took = false
    box.onclick = (event) => {
      if (took) return void (took = false)
      if (event?.shiftKey) return edit.onChoose([node], !edit.chosen(node), true)
      if (event?.ctrlKey || event?.metaKey) return edit.onChoose([node], !edit.chosen(node), false)
      if (edit.onPick) edit.onPick(node)
    }
    let holding = null
    box.addEventListener?.('pointerdown', () => {
      holding = setTimeout(() => {
        holding = null
        took = true
        edit.onChoose([node], !edit.chosen(node), false)
      }, 450)
    })
    const drop = () => { if (holding) clearTimeout(holding); holding = null }
    box.addEventListener?.('pointerup', drop)
    box.addEventListener?.('pointercancel', drop)
    box.addEventListener?.('pointermove', drop)
    return box
  }

  const table = element('div', 'grid')
  table.style.setProperty('--columns', grid.columns)
  // Classes, not counts: `repeat(0, …)` is not a valid track list, and a browser that
  // rejects one throws the whole template away and lays the table out in implicit
  // tracks - every cell present, every one the wrong width. A card with no step yet is
  // the first thing every new card is, so this is the common case, not the corner.
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
      } else area(box, NAME_COLUMN + entry.column, entry.columnSpan, index + 1, 1)
      table.append(box)
    }
  })

  // The reading view puts steps in this column too, so it names it for what it holds.
  const label = element('div', 'label heading', grid.heading ?? 'Ingredient')
  label.style.gridColumn = `1 / ${NAME_COLUMN + 1}`
  label.style.gridRow = String(head + 1)
  // Shift-clicking the heading takes the whole strand, which is what choosing every row
  // of it means; it is where the header checkbox used to be.
  if (edit?.onChoose && grid.rows.length > 0) {
    label.classList.add('pickable')
    label.onclick = (event) => {
      if (!(event?.shiftKey || event?.ctrlKey || event?.metaKey)) return
      const on = !grid.rows.every((node) => edit.chosen(node))
      edit.onChoose(grid.rows, on, false)
    }
  }
  table.append(label)
  for (let column = 1; column <= grid.columns; column++)
    table.append(put(element('div', 'label', pad(numbers[column - 1])), {
      column: NAME_COLUMN + column, columnSpan: 1, row: head + 1, rowSpan: 1,
    }))

  grid.rows.forEach((node, index) => {
    const row = head + 2 + index
    const last = row === bottom
    // Every field of a row leads to the same ingredient: the amount, the unit and the
    // name are one line of the card split into three columns, not three things. They sit
    // in a slot of their own, which runs from the ingredient column to whatever takes
    // this ingredient - the free area to its right, drawn as the reach of the cell that
    // is waiting rather than as a rectangle worked out separately.
    const waits = (takenBy.get(node) ?? grid.columns + 1) - 1
    const hold = element('div', 'hold')
    hold.style.gridArea = `${row} / 1 / span 1 / span ${NAME_COLUMN + waits}`
    if (last) hold.classList.add('lowest')
    if (edit?.chosen?.(node)) hold.classList.add('chosen')
    for (const field of ingredientFields(node, scale)) {
      // The reading view hides these a row at a time as steps take them over.
      field.node.dataset.row = String(index)
      area(field.node, field.column, field.columnSpan, 1, 1)
      hold.append(field.node)
    }
    choosable(hold, node)
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

  // Under the last ingredient, where the next one goes. It runs the width of the
  // ingredient column, because a row that starts halfway leaves a notch.
  if (adds) {
    const box = element('div', 'add', '+ Ingredient')
    box.onclick = edit.onAdd
    table.append(put(box, {
      column: 1, columnSpan: NAME_COLUMN, row: bottom, rowSpan: 1, last: true,
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
