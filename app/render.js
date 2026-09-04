import { DURATION } from './facts.js'
import { buildGrid } from './grid.js'
import { formatAmount, scaleAmount } from './amount.js'

/*
 * Where the ingredient block ends when nothing is being written. Writing puts a column
 * of ticks in front of it, so everything after moves one column right; the arithmetic
 * below reads `lead`, which is this plus that column when there is one.
 */
const NAME_COLUMN = 3
const UNIT = /(\d)\s+(?=[^\s\d]{1,3}(?:[\s,]|$))/g

/** A card as a table. Column 0 of the grid is the three ingredient columns. */
export function renderCard(card, scale = 1, edit = null) {
  return renderGrid(buildGrid(card), scale, edit)
}

/**
 * Any grid as a table. Split out from `renderCard` because the editor draws a grid it
 * built itself, from several strands; it must go through this code to be the card rather
 * than a picture of it.
 *
 * `edit` is what makes the table editable, and it is all the editor needs the drawing to
 * give it. Layout keeps, for every row and every cell, the node it came from; handing
 * that node back on a click is the whole back-reference, so the editor never has to work
 * out from a position in the DOM what was clicked.
 *
 *   `onPick(node)`   a row or a step was tapped
 *   `here(node)`     it is the one being written, and is ringed
 *   `chosen(node)`   it goes into the one being written, and is shaded
 *   `onAdd()`        draw a row under the last ingredient that adds one
 *   `onStep()`       draw a column after the last step that adds one
 *
 * Nothing here writes. A table being written is the table it is read as, to the pixel:
 * the same columns, the same rows, the same cells, and the only thing that ever differs
 * is colour. Every field is in the form, which is a layer over the page - so a recipe
 * cannot change shape under the hand that is writing it, because nothing about the hand
 * is in the table at all.
 *
 * That was not the first arrangement. Cells opened where they stood, and a field is not
 * the words it replaces: it wraps at a different width, so the text reflowed in the one
 * cell being looked at. The column of boxes went the same way. Both are in the form now.
 */
export function renderGrid(grid, scale = 1, edit = null) {
  // A slice of the card numbers its columns with the places they hold in the whole of
  // it, so the header still says when this is.
  const numbers = grid.numbers ?? Array.from({ length: grid.columns }, (_, index) => index + 1)
  const lead = NAME_COLUMN
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
  /* A row or a step, as a target: a tap on it opens the form on that one thing. */
  const target = (box, node) => {
    if (!edit?.onPick) return box
    box.classList.add('pickable')
    if (edit.here?.(node)) box.classList.add('here')
    if (edit.chosen?.(node)) box.classList.add('chosen')
    box.onclick = () => edit.onPick(node)
    return box
  }

  const table = element('div', 'grid')
  table.style.setProperty('--columns', grid.columns)
  // The editor's table is one column longer, for `+ Step`. The class is what gives that
  // column a track of its own; without it the column is implicit and a band drawn
  // `1 / -1` stops where the named tracks do.
  if (edit?.onStep) table.classList.add('choosing')
  // Classes, not counts: `repeat(0, …)` is not a valid track list, and a browser that
  // rejects one throws the whole template away and lays the table out in implicit
  // tracks - every cell present, every one the wrong width. A card with no step yet is
  // the first thing every new card is, so this is the common case, not the corner.
  if (grid.columns === 0) table.classList.add('flat')

  // The band holds only what belongs to the recipe; a step's own preparations are drawn
  // in its cell. Those are written in the specification, so here they are only drawn.
  const band = grid.band

  const head = band.length
  // The row that adds an ingredient is a row of the table like any other, so it counts
  // towards where the bottom is. Otherwise the rows above it are drawn as the last ones
  // and drop their bottom rule, and the table ends twice.
  const adds = edit?.onAdd ? 1 : 0
  const bottom = head + 1 + grid.rows.length + adds

  /*
   * Preparations go over the head of the table, each above the column it comes before.
   *
   * A preparation is something done before something else, and what it is done before is
   * a step - so it is drawn over that step's column, above the number that names it,
   * which is when it happens. One belonging to the recipe is the same thing said about
   * the first step there is, so it goes over the ingredient block.
   *
   * The band is rows 1 to `head`, the head is row `head + 1`, and the rows of the card
   * go on starting where they always did.
   */
  band.forEach((entries, index) => {
    for (const entry of entries) {
      const box = preparationField(entry.node)
      if (entry.column === 0) box.classList.add('whole')
      area(box, entry.column === 0 ? 1 : lead + entry.column, entry.column === 0 ? lead : 1, index + 1, 1)
      table.append(box)
    }
  })

  // The reading view puts steps in this column too, so it names it for what it holds.
  const label = element('div', 'label heading', grid.heading ?? 'Ingredient')
  label.style.gridColumn = `1 / ${lead + 1}`
  label.style.gridRow = String(head + 1)
  table.append(label)
  /*
   * A column number takes the rows the steps in that column stand on - what this moment
   * of the card is made of. A column can hold more than one step, because two strands
   * that have not met yet are the same distance from the end, and taking the column
   * takes both.
   */
  for (let column = 1; column <= grid.columns; column++) {
    const box = element('div', 'label', pad(numbers[column - 1]))
    table.append(put(box, {
      column: lead + column, columnSpan: 1, row: head + 1, rowSpan: 1,
    }))
  }

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
    hold.style.gridArea = `${row} / 1 / span 1 / span ${lead + waits}`
    if (last) hold.classList.add('lowest')
    for (const field of ingredientFields(node, scale)) {
      // The reading view hides these a row at a time as steps take them over.
      field.node.dataset.row = String(index)
      area(field.node, field.column, field.columnSpan, 1, 1)
      hold.append(field.node)
    }
    // The row is the target, not its three cells: they are one line of the card split
    // into three columns, and the blank it waits through is as much the row as they are.
    table.append(target(hold, node))
  })

  /*
   * A step in a slot of its own. The slot is one column wide, which is all a step ever
   * needs, and it is what stops the cell from holding the left edge for the whole card:
   * a sticky cell may not leave its own slot, so the next step pushes it out exactly as
   * it arrives. That is the roll.
   */
  /*
   * A step's region: its own cell, and every rectangle of blank that flows into it.
   * Together they make an L - the cell standing at the right of the rows it takes, and
   * the space those rows wait in reaching back under them - and an L is one shape. It
   * takes one colour, it lights up at once, and it is one target.
   */
  const region = new Map()
  for (const cell of grid.cells) {
    const box = target(stepField(cell.node), cell.node)
    region.set(cell, [box])
    const holder = element('div', 'holds')
    area(box, 1, 1, 1, 1)
    holder.append(box)
    table.append(put(holder, {
      column: lead + cell.column, columnSpan: 1,
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
    if (free.into) {
      region.get(free.into)?.push(box)
      if (edit?.chosen?.(free.into.node)) box.classList.add('chosen')
    }
    table.append(put(box, {
      column: lead + free.column, columnSpan: free.columnSpan,
      row: head + 2 + free.row, rowSpan: free.rowSpan,
      last: head + 1 + free.row + free.rowSpan === bottom,
    }))
  }

  /*
   * The region wired as one. Pointing anywhere in it lights all of it and opens the
   * step, because all of it is that step: you aimed at the blank inside `vermengen` and
   * got `Magerquark` back when the blank belonged to the row waiting in it.
   */
  if (edit?.onPick)
    for (const [cell, boxes] of region)
      for (const box of boxes) {
        box.classList.add('reaches')
        box.onclick = () => edit.onPick(cell.node)
        box.onpointerenter = () => boxes.forEach((one) => one.classList.add('lit'))
        box.onpointerleave = () => boxes.forEach((one) => one.classList.remove('lit'))
      }

  // Under the last ingredient, where the next one goes. It runs the width of the
  // ingredient column, because a row that starts halfway leaves a notch.
  if (adds) {
    const box = element('div', 'add', '+ Ingredient')
    box.onclick = edit.onAdd
    table.append(put(box, {
      column: 1, columnSpan: lead, row: bottom, rowSpan: 1, last: true,
    }))
    // and the rest of that row, so the table has an edge along its whole width.
    if (grid.columns > 0)
      table.append(put(element('div', 'free'), {
        column: lead + 1, columnSpan: grid.columns, row: bottom, rowSpan: 1, last: true,
      }))
  }

  // After the last step, where the next one goes. A column of its own, because that is
  // what a step is: the table has to say a step can be added before anybody ticks a row.
  // It runs the full height for the same reason the add row runs the full width.
  if (edit?.onStep) {
    const box = element('div', 'add step', '+ Step')
    box.onclick = edit.onStep
    // Everything under the head: every row, and the row that adds one.
    table.append(put(box, {
      column: lead + grid.columns + 1,
      columnSpan: 1,
      row: head + 2,
      rowSpan: bottom - head - 1,
      last: true,
    }))
  }

  return table
}

function pad(number) {
  return String(number).padStart(2, '0')
}

/** A preparation, over the column of the step it comes before. */
function preparationField(node) {
  const box = element('div', 'preparation')
  box.append(element('span', '', bind(node.text)))
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
  cell.append(marked('verb', node.verb))
  if (node.aside) cell.append(element('div', 'note', bind(node.aside)))
  return cell
}

/** A field as tall as what it holds. Guarded: a stub DOM measures nothing. */
export function fit(area) {
  if (!area || typeof area.scrollHeight !== 'number') return
  area.style.height = 'auto'
  area.style.height = `${area.scrollHeight}px`
}

function place(node, grid, { column, columnSpan, row, rowSpan, last }, lead) {
  area(node, column, columnSpan, row, rowSpan)
  if (column + columnSpan - 1 === lead + grid.columns) node.classList.add('rightmost')
  if (last) node.classList.add('lowest')
  return node
}

function area(node, column, columnSpan, row, rowSpan) {
  node.style.gridArea = `${row} / ${column} / span ${rowSpan} / span ${columnSpan}`
}

function bind(text) {
  return text.replace(UNIT, '$1\u00a0')
}

/**
 * A line of a step, with its durations marked.
 *
 * How long a step takes is the one thing in a verb a cook looks for while the pan is
 * already hot, and it is buried in the middle of the words. Marking it is not
 * decoration: it is the same pattern the specification sums, so the tags on the table
 * are exactly what the `Time` row adds up, and you can see where the total came from.
 */
function marked(className, text) {
  const box = element('div', className)
  const bound = bind(text)
  let at = 0
  for (const found of bound.matchAll(DURATION)) {
    if (found.index > at) box.append(element('span', '', bound.slice(at, found.index)))
    box.append(element('span', 'time', found[0]))
    at = found.index + found[0].length
  }
  if (at < bound.length) box.append(element('span', '', bound.slice(at)))
  return box
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
