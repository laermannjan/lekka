import { DURATION } from './facts.js'
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
 * built itself, from several strands; it must go through this code to be the card rather
 * than a picture of it.
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
    // A cell with no form behind it is not offered as a tap. A preparation the recipe
    // owns is the one such cell: it is written in the specification, not in a sheet.
    if (edit.pickable && !edit.pickable(node)) return box
    box.classList.add('pickable')
    box.onclick = () => edit.onPick(node)
    return box
  }

  /*
   * Taking a set of rows at once: a heading takes what stands under it. Holding it and
   * clicking it with a modifier are the same act, so they are wired together here - the
   * hold is the only one a thumb has, and without it a phone could not take a strand at
   * all once the column of checkboxes went.
   */
  /*
   * A press held on a control. Six pixels of drift is a hand holding still, not a drag,
   * which is the same threshold the reading view uses; a pixel used to call the press
   * off and lose the row. The callout is suppressed because a long press on a phone
   * would otherwise raise the selection menu over whatever it has just chosen.
   */
  const onHold = (box, run) => {
    let waiting = null
    let from = null
    const drop = () => { if (waiting) clearTimeout(waiting); waiting = null }
    box.addEventListener?.('pointerdown', (event) => {
      from = { x: event?.clientX ?? 0, y: event?.clientY ?? 0 }
      waiting = setTimeout(() => { waiting = null; run() }, 450)
    })
    box.addEventListener?.('pointerup', drop)
    box.addEventListener?.('pointercancel', drop)
    box.addEventListener?.('pointermove', (event) => {
      if (!waiting || !from) return
      const moved = Math.max(
        Math.abs((event?.clientX ?? 0) - from.x),
        Math.abs((event?.clientY ?? 0) - from.y),
      )
      if (moved > 6) drop()
    })
    box.addEventListener?.('contextmenu', (event) => event?.preventDefault?.())
  }

  /*
   * A step, as a target. A plain tap opens its cell; shift, command or a long press says
   * "these rows are what goes in", which is the same grammar a row is chosen with.
   */
  const stepTarget = (box, node, open) => {
    if (!edit?.onEditStep && !edit?.onOpen) return box
    box.classList.add('pickable')
    let took = false
    box.onclick = (event) => {
      if (took) return void (took = false)
      if (event?.shiftKey || event?.ctrlKey || event?.metaKey) return edit.onEditStep?.(node)
      if (open) edit.onOpen?.(node, 'verb')
    }
    onHold(box, () => {
      took = true
      edit.onEditStep?.(node)
    })
    return box
  }

  const takes = (box, gather) => {
    if (!edit?.onChoose) return box
    const run = () => {
      const nodes = gather()
      if (nodes.length === 0) return
      edit.onChoose(nodes, !nodes.every((node) => edit.chosen(node)), false)
    }
    box.classList.add('pickable')
    let took = false
    box.onclick = (event) => {
      if (took) return void (took = false)
      if (event?.shiftKey || event?.ctrlKey || event?.metaKey) run()
    }
    onHold(box, () => { took = true; run() })
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
    onHold(box, () => { took = true; edit.onChoose([node], !edit.chosen(node), false) })
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
      const box = pick(preparationField(entry.node), entry.node)
      if (ends.has(entry.column - 1)) box.classList.add('joined')
      if (entry.column === 0) {
        box.style.gridColumn = '1 / -1'
        box.style.gridRow = String(index + 2)
      } else area(box, NAME_COLUMN + entry.column, entry.columnSpan, index + 2, 1)
      table.append(box)
    }
  })

  // The reading view puts steps in this column too, so it names it for what it holds.
  const label = element('div', 'label heading', grid.heading ?? 'Ingredient')
  label.style.gridColumn = `1 / ${NAME_COLUMN + 1}`
  label.style.gridRow = '1'
  // The heading takes the whole strand, which is what choosing every row of it means;
  // it is where the header checkbox used to be.
  if (grid.rows.length > 0) takes(label, () => grid.rows)
  table.append(label)
  /*
   * A column number takes the rows the steps in that column stand on - what this moment
   * of the card is made of. A column can hold more than one step, because two strands
   * that have not met yet are the same distance from the end, and taking the column
   * takes both.
   */
  for (let column = 1; column <= grid.columns; column++) {
    const box = element('div', 'label', pad(numbers[column - 1]))
    takes(box, () =>
      grid.cells
        .filter((cell) => cell.column === column)
        .flatMap((cell) => grid.rows.slice(cell.row, cell.row + cell.rowSpan)))
    table.append(put(box, {
      column: NAME_COLUMN + column, columnSpan: 1, row: 1, rowSpan: 1,
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
    hold.style.gridArea = `${row} / 1 / span 1 / span ${NAME_COLUMN + waits}`
    if (last) hold.classList.add('lowest')
    if (edit?.chosen?.(node)) hold.classList.add('chosen')
    for (const field of ingredientFields(node, scale, edit)) {
      // The reading view hides these a row at a time as steps take them over.
      field.node.dataset.row = String(index)
      area(field.node, field.column, field.columnSpan, 1, 1)
      // A plain tap on a cell opens the row it belongs to, with the caret in that cell.
      // A modifier is left to bubble, because that is how the row is chosen.
      if (edit?.onOpen && field.field)
        field.node.onclick = (event) => {
          if (event?.shiftKey || event?.ctrlKey || event?.metaKey) return
          edit.onOpen(node, field.field)
        }
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
    const open = edit?.openAt === cell.node
    const box = open
      ? stepTarget(writableStep(cell.node, edit), cell.node, false)
      : stepTarget(pick(stepField(cell.node), cell.node), cell.node, true)
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
    // Everything under the head: the band, every row, and the row that adds one.
    table.append(put(box, {
      column: NAME_COLUMN + grid.columns + 1,
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

function preparationField(node) {
  const box = element('div', 'preparation', bind(node.text))
  if (node.aside) box.append(element('span', 'aside', bind(node.aside)))
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
    /*
     * The row is also the target for choosing it, and the fields cover the whole of it.
     * A click is let through, so shift and command still choose the row from anywhere in
     * it; a press is not, because holding a row is how a thumb chooses it and holding
     * inside a field is how a thumb selects text.
     */
    input.onpointerdown = (event) => event.stopPropagation()
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

function ingredientFields(node, scale, edit) {
  // A slice can put a step where ingredients go, standing for everything it consumed.
  if (node.kind === 'step') {
    const box = element('div', 'carried', node.verb)
    if (node.aside) box.append(element('span', 'aside', node.aside))
    return [{ node: box, column: 1, columnSpan: NAME_COLUMN }]
  }

  if (edit?.openAt === node) return writableFields(node, edit)

  const amount = scaleAmount(node.amount, scale)
  const name = element('div', 'name')
  name.append(element('span', 'noun', node.name))
  if (node.aside) name.append(element('span', 'aside', node.aside))

  if (amount?.kind === 'words')
    return [
      { node: element('div', 'words', amount.text), column: 1, columnSpan: 2, field: 'amount' },
      { node: name, column: NAME_COLUMN, columnSpan: 1, field: 'name' },
    ]

  return [
    { node: element('div', 'amount', amount ? formatAmount({ ...amount, unit: '' }) : ''), column: 1, columnSpan: 1, field: 'amount' },
    { node: element('div', 'unit', amount?.unit ?? ''), column: 2, columnSpan: 1, field: 'unit' },
    { node: name, column: NAME_COLUMN, columnSpan: 1, field: 'name' },
  ]
}

/** A step's own preparations: what is done before it, drawn above it. */
function preparationsOf(node) {
  return (node.children ?? []).filter((child) => child.kind === 'preparation')
}

function stepField(node) {
  const cell = element('div', 'step')
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
    // As on a row: a click reaches the cell, a press does not.
    input.onpointerdown = (event) => event.stopPropagation()
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
