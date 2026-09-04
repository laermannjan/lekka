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
 *   `onOpen(node, field)`  a cell was tapped, and which of its fields
 *   `onChoose(node, on)`   a box was ticked or unticked
 *   `onAdd()`              draw a row under the last ingredient that adds one
 *
 * Choosing happens in boxes, and a box stands for an **input** rather than for a row.
 * A step takes whole strands, so unticking one row of a strand it swallowed is not a
 * move the format has: what goes into `vermengen` is `abkühlen`, not the Roggenschrot
 * three steps inside it. So the box for an ingredient sits in its row and the box for a
 * step sits in that step's cell, and only the things this step may actually take are
 * given one.
 *
 * The column they sit in is drawn for as long as the recipe is being written, even while
 * it holds nothing: appearing only when a step is opened, it would shift the whole table
 * sideways under the hand.
 */
export function renderGrid(grid, scale = 1, edit = null) {
  // A slice of the card numbers its columns with the places they hold in the whole of
  // it, so the header still says when this is.
  const numbers = grid.numbers ?? Array.from({ length: grid.columns }, (_, index) => index + 1)
  /*
   * A column of checkboxes, in front of the table and only while it is being written.
   *
   * It was taken out once, on the grounds that a column costs horizontal space and space
   * is what this table is short of. That is true of a table being read, and this column
   * is never drawn there - it belongs to the editor, like `+ Step`. What replaced it was
   * a shift-click and a long press, and a control nobody can see is not cheaper than a
   * column: it is a control nobody uses.
   */
  const ticks = edit?.onChoose ? 1 : 0
  const lead = NAME_COLUMN + ticks
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
  /* A step, as a target: a tap opens its cell, and opening it ticks what goes into it. */
  const stepTarget = (box, node, open) => {
    if (!edit?.onOpen || !open) return box
    box.classList.add('pickable')
    box.onclick = () => edit.onOpen(node, 'verb')
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
   * Preparations go under the head of the table, not over it.
   *
   * The column numbers say when a column happens; a preparation that happens before
   * column four was being drawn above the line that says which column four is, which put
   * the first thing printed on the card outside the table it belongs to. Under the head
   * it reads as what it is: a row of the table that brings no ingredient, so its three
   * left-hand fields stand empty.
   *
   * So the head is row 1, the band is rows 2 to `head + 1`, and the rows of the card go
   * on starting where they always did.
   */
  band.forEach((entries, index) => {
    const ends = new Set(entries.map((entry) => entry.column + entry.columnSpan - 1))
    for (const entry of entries) {
      const box = preparationField(entry.node, entry.column === 0)
      if (ends.has(entry.column - 1)) box.classList.add('joined')
      if (entry.column === 0) {
        box.style.gridColumn = '1 / -1'
        box.style.gridRow = String(index + 2)
      } else area(box, lead + entry.column, entry.columnSpan, index + 2, 1)
      table.append(box)
    }
  })

  /*
   * The head of the tick column is empty. It held a box that took every row, back when a
   * box stood for a row; a box stands for an input now, and "every input" is what a step
   * already has when it is opened.
   */
  if (ticks) {
    const head = element('div', 'ticker label')
    area(head, 1, 1, 1, 1)
    table.append(head)
  }

  // The reading view puts steps in this column too, so it names it for what it holds.
  const label = element('div', 'label heading', grid.heading ?? 'Ingredient')
  label.style.gridColumn = `${1 + ticks} / ${lead + 1}`
  label.style.gridRow = '1'
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
      column: lead + column, columnSpan: 1, row: 1, rowSpan: 1,
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
    if (edit?.chosen?.(node)) hold.classList.add('chosen')
    for (const field of ingredientFields(node, scale, edit, ticks)) {
      // The reading view hides these a row at a time as steps take them over.
      field.node.dataset.row = String(index)
      area(field.node, field.column, field.columnSpan, 1, 1)
      // A tap on a cell opens the row it belongs to, with the caret in that cell.
      if (edit?.onOpen && field.field) field.node.onclick = () => edit.onOpen(node, field.field)
      hold.append(field.node)
    }
    if (edit?.onOpen) hold.classList.add('pickable')
    table.append(hold)
  })

  /*
   * A step in a slot of its own. The slot is one column wide, which is all a step ever
   * needs, and it is what stops the cell from holding the left edge for the whole card:
   * a sticky cell may not leave its own slot, so the next step pushes it out exactly as
   * it arrives. That is the roll.
   */
  for (const cell of grid.cells) {
    const open = edit?.openAt === cell.node
    const box = open
      ? stepTarget(writableStep(cell.node, edit), cell.node, false)
      : stepTarget(stepField(cell.node, edit), cell.node, true)
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
    table.append(put(box, {
      column: lead + free.column, columnSpan: free.columnSpan,
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
    // Everything under the head: the band, every row, and the row that adds one.
    table.append(put(box, {
      column: lead + grid.columns + 1,
      columnSpan: 1,
      row: 2,
      rowSpan: bottom - 1,
      last: true,
    }))
  }

  return table
}

function pad(number) {
  return String(number).padStart(2, '0')
}

/**
 * A preparation. One belonging to a step is a tag in that step's cell; one belonging to
 * the recipe spans the whole table, and the table can be three times the width of the
 * screen - so its words go in a band of their own that is pinned to the part you can
 * see, and centred in that. Wherever the table is scrolled to, it is where you look.
 */
function preparationField(node, spanning = false) {
  const box = element('div', 'preparation')
  const said = spanning ? element('span', 'said') : box
  said.append(element('span', '', bind(node.text)))
  if (node.aside) said.append(element('span', 'aside', bind(node.aside)))
  if (spanning) box.append(said)
  return box
}

/**
 * A row being written is the row itself, opened.
 *
 * The four values of an ingredient already have three cells drawn for them, so writing
 * one is those cells turned into fields rather than a form put over the table. The
 * fields keep the cell's own alignment and colour, so a row being written looks like the
 * row it will be, and the amount and the unit stay two fields because that is what the
 * line is: a number and what it counts.
 *
 * Only the row being written is opened. Every other row stays as it is read, because a
 * field is one line and cuts where a cell wraps: a table of nothing but fields is a
 * table you cannot read while writing in it.
 */
function writableFields(node, edit) {
  const read = () => ({
    amount: fields.amount.value,
    unit: fields.unit.value,
    name: fields.name.value,
    aside: fields.aside.value,
  })

  const make = (className, value, placeholder) => {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = `field ${className}`
    input.value = value
    input.placeholder = placeholder
    // On change rather than on input: the draft is told when the caret leaves, so
    // nothing is rebuilt under it and tabbing along a row is not interrupted.
    input.onchange = () => edit.onField(node, read())
    return input
  }

  const amount = node.amount
  const fields = {
    amount: make('amount', amount ? formatAmount({ ...amount, unit: '' }) : '', '–'),
    unit: make('unit', amount?.unit ?? '', '–'),
    name: make('name', node.name, 'Name'),
    aside: make('aside', node.aside ?? '', '…'),
  }

  // The editor keeps the field a row was drawn with, so a fault about that row can put
  // the caret in it - which is what "the fault leads to the thing it is about" means
  // once the thing is a row and not a form.
  edit.onDrawn?.(node, fields)

  // Name and qualifier sit side by side, as they are read, so a row being written is
  // the same height as one being read.
  const names = element('div', 'names')
  names.append(fields.name, fields.aside)

  return [
    { node: fields.amount, column: 1, columnSpan: 1 },
    { node: fields.unit, column: 2, columnSpan: 1 },
    { node: names, column: NAME_COLUMN, columnSpan: 1 },
  ]
}

function ingredientFields(node, scale, edit, ticks = 0) {
  const shift = (fields) =>
    ticks
      // No `field`: the box is not a way into the row, it is how the row is chosen, and
      // a click on it must not also open the cells beside it.
      ? [{ node: tickBox(node, edit), column: 1, columnSpan: 1 },
         ...fields.map((one) => ({ ...one, column: one.column + ticks }))]
      : fields

  // A slice can put a step where ingredients go, standing for everything it consumed.
  if (node.kind === 'step') {
    const box = element('div', 'carried', node.verb)
    if (node.aside) box.append(element('span', 'aside', node.aside))
    return shift([{ node: box, column: 1, columnSpan: NAME_COLUMN }])
  }

  if (edit?.openAt === node) return shift(writableFields(node, edit))

  const amount = scaleAmount(node.amount, scale)
  const name = element('div', 'name')
  name.append(element('span', 'noun', node.name))
  if (node.aside) name.append(element('span', 'aside', node.aside))

  if (amount?.kind === 'words')
    return shift([
      { node: element('div', 'words', amount.text), column: 1, columnSpan: 2, field: 'amount' },
      { node: name, column: NAME_COLUMN, columnSpan: 1, field: 'name' },
    ])

  return shift([
    { node: element('div', 'amount', amount ? formatAmount({ ...amount, unit: '' }) : ''), column: 1, columnSpan: 1, field: 'amount' },
    { node: element('div', 'unit', amount?.unit ?? ''), column: 2, columnSpan: 1, field: 'unit' },
    { node: name, column: NAME_COLUMN, columnSpan: 1, field: 'name' },
  ])
}

/**
 * The box an input is chosen with. Only the things the open step may take have one, so
 * the column is empty until a step is opened and holds nothing that would be a lie.
 */
function tickBox(node, edit, className = 'ticker') {
  const box = element('div', className)
  if (!edit?.boxFor?.(node)) return box
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.className = 'tick'
  input.checked = Boolean(edit.ticked?.(node))
  input.onclick = (event) => {
    event?.stopPropagation?.()
    edit.onChoose(node, input.checked)
  }
  // Handed back like a field: ticking one draws the table again, and the caret has to
  // be put on the box drawn in this one's place or the keyboard cannot reach the next.
  edit.onTicked?.(node, input)
  box.append(input)
  return box
}

/** A step's own preparations: what is done before it, drawn above it. */
function preparationsOf(node) {
  return (node.children ?? []).filter((child) => child.kind === 'preparation')
}

function stepField(node, edit) {
  const cell = element('div', 'step')
  // A ticked strand comes in whole, so every step of it is shaded, not only its rows.
  if (edit?.chosen?.(node)) cell.classList.add('chosen')
  if (edit?.boxFor?.(node)) cell.append(tickBox(node, edit, 'ticker inline'))
  for (const prep of preparationsOf(node)) cell.append(preparationField(prep))
  cell.append(marked('verb', node.verb))
  if (node.aside) cell.append(element('div', 'note', bind(node.aside)))
  return cell
}

/**
 * A step being written: its verb, its note, and what has to be done before it.
 *
 * A preparation belonging to a step is drawn over that step's column when the recipe is
 * read, which is where it happens. Written, it belongs in the step's own cell - it is
 * one of the things the step says about itself, and a band cell has nothing to say about
 * which step it is attached to.
 *
 * The note and an empty preparation stay out of sight until the cell is reached for.
 * Both are rare, and a field on every cell of every step would be noise on a table whose
 * whole point is that it is dense.
 */
function writableStep(node, edit) {
  const written = preparationsOf(node).map((child) =>
    child.aside ? `${child.text} (${child.aside})` : child.text,
  )

  const read = () => ({
    verb: verb.value,
    aside: note.value,
    preparations: befores.map((field) => field.value.trim()).filter(Boolean),
  })

  /*
   * A textarea and not an input: a step's verb is often longer than the column it stands
   * in, a cell being read wraps it, and a field that cuts instead would make writing the
   * one place the card cannot be read. It grows to whatever it holds, and enter commits
   * rather than adding a line the format has no room for.
   */
  const make = (className, value, placeholder) => {
    const input = document.createElement('textarea')
    input.rows = 1
    input.className = `field ${className}`
    input.value = value
    input.placeholder = placeholder
    input.onchange = () => edit.onField(node, read())
    input.oninput = () => fit(input)
    input.onkeydown = (event) => {
      if (event?.key !== 'Enter') return
      event.preventDefault?.()
      input.blur?.()
    }
    return input
  }

  const verb = make('verb', node.verb, 'Step')
  const note = make('note', node.aside ?? '', 'Note')
  // One field per preparation, and one more, so another can be added by typing into it.
  // Above the verb, because that is when they happen.
  const befores = [...written, ''].map((line) => make('before', line, 'Before it'))

  // `all` is what has to be sized; the names are what the caret can be sent to. A cell
  // may hold several preparations, and every one of them wraps.
  edit.onDrawn?.(node, {
    verb,
    note,
    before: befores.at(-1),
    all: [...befores, verb, note],
  })

  const cell = element('div', 'step')
  cell.append(...befores, verb, note)
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
