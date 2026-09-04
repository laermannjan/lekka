import test from 'node:test'
import assert from 'node:assert/strict'

import { install, all, one, tap, byText, byClass, descendants } from './dom.js'

const body = install()
/** What `confirm` answered, and what it was asked. */
let asked = []
globalThis.confirm = (text) => {
  asked.push(text)
  return globalThis.confirm.answer ?? true
}
const { parseCard } = await import('../app/card.js')
const { toDraft } = await import('../app/edit.js')
const { buildEditor } = await import('../app/editor.js')

/** The editor, and whatever it last tried to save. */
function open(text, refuse = null, throws = false) {
  body.replaceChildren()
  const saved = []
  let release = null
  const screen = buildEditor({
    draft: toDraft(parseCard(text)),
    onSave: async (written) => {
      // A write that does not resolve until the test says so, for the window in which
      // the page is still live.
      if (release) await new Promise((go) => (release = go))
      // A write that rejects rather than reporting - a full localStorage, say.
      if (throws) throw new Error('storage is full')
      if (refuse) return refuse
      saved.push(written)
    },
    onClose: () => saved.push(null),
  })
  return { screen, saved, hold: () => (release = () => {}), let_go: () => release?.() }
}

/**
 * A field of the specification, found by the label beside it. The specification is a
 * flat grid of label and value cells, so the value is the cell after the label.
 */
function type(screen, name, value) {
  const spec = one(screen, byClass('spec'), 'specification')
  const at = spec.children.findIndex((node) => byClass('label')(node) && node.textContent === name)
  assert.notEqual(at, -1, `no "${name}" row`)
  const input = one(spec.children[at + 1], (node) => node.tag === 'input', `${name} field`)
  input.value = value
  input.onchange?.()
}

/* A bar holding one button reads as that button, so a press means the button. */
const click = (root, text) => {
  const found = all(root).filter(byText(text))
  return tap(found.find((node) => node.tag === 'button') ?? one(root, byText(text), `"${text}"`))
}
const field = (form, name) =>
  one(form, (node) => node.tag === 'label' && node.children[0]?.textContent === name, name)
    .children[1]

function fill(values) {
  const form = one(sheet(), (node) => node.tag === 'form', 'form')
  for (const [name, value] of Object.entries(values)) field(form, name).value = value
  return form
}

const submit = () => {
  const form = one(sheet(), (node) => node.tag === 'form', 'form')
  form.onsubmit()
  sheet().close()
}

/* Writing a cell. Cells are drawn as they are read until one is tapped, and only the
   one tapped is opened, so every helper here opens before it types. */

const holdsOf = (screen) => all(onlyTable(screen)).filter(byClass('hold'))
// `+ Step` is `add step`, and is a button rather than a cell.
const stepCells = (screen) =>
  all(onlyTable(screen)).filter((node) => byClass('step')(node) && !byClass('add')(node))

/** What a cell says, whether it is open or drawn as it is read. */
function says(cell, kind) {
  const field = all(cell).find((node) => byClass('field')(node) && byClass(kind)(node))
  if (field) return field.value
  const shownAs = all(cell).find(byClass(kind === 'verb' ? 'verb' : 'noun'))
  return shownAs ? plain(shownAs) : ''
}

const isOpen = (cell) => all(cell).some(byClass('field'))

/** Open the nth ingredient row and hand back its four fields. */
function rowOf(screen, index, at = 'name') {
  const hold = holdsOf(screen)[index]
  if (!hold) throw new Error(`no row ${index} of ${holdsOf(screen).length}`)
  if (!isOpen(hold)) tap(one(hold, byClass(at), at))
  const fields = all(holdsOf(screen)[index]).filter(byClass('field'))
  const of = (kind) => fields.find(byClass(kind))
  return { amount: of('amount'), unit: of('unit'), name: of('name'), aside: of('aside') }
}

/** Type into a row and leave it, which is what commits. */
function write(screen, index, values) {
  const row = rowOf(screen, index)
  for (const [key, value] of Object.entries(values)) row[key].value = value
  row.name.onchange()
  return row
}

/** Add an ingredient the way a person does: a row, then type into it. */
function enter(screen, values) {
  click(screen, '+ Ingredient')
  return write(screen, holdsOf(screen).length - 1, values)
}

/** The step cell whose verb reads this, left as it is drawn. */
function cellNamed(screen, verb) {
  const found = stepCells(screen).find((cell) => says(cell, 'verb') === verb)
  if (!found)
    throw new Error(`no step "${verb}" among ${JSON.stringify(stepCells(screen).map((c) => says(c, 'verb')))}`)
  return found
}

/** Open the step whose verb reads this, and hand back its fields. */
function stepNamed(screen, verb) {
  const cell = cellNamed(screen, verb)
  if (!isOpen(cell)) tap(cell)
  const open = cellNamed(screen, verb)
  const fields = all(open).filter(byClass('field'))
  return {
    cell: open,
    verb: fields.find(byClass('verb')),
    note: fields.find(byClass('note')),
    before: fields.filter(byClass('before')),
  }
}

/** Name the step that has no name yet: the one `Process in step` has just made. */
function nameStep(screen, verb, values = {}) {
  const step = stepNamed(screen, '')
  step.verb.value = verb
  if (values.note !== undefined) step.note.value = values.note
  if (values.before !== undefined) step.before.at(-1).value = values.before
  step.verb.onchange()
  return step
}

/** Rename a step where it stands. */
function rename(screen, from, to) {
  const step = stepNamed(screen, from)
  step.verb.value = to
  step.verb.onchange()
}

/** Opening a step's cell is what puts its inputs on the boxes. */
const openStep = (screen, verb) => tap(cellNamed(screen, verb))

/** Open a row by tapping its name, which is how its own bar is raised. */
function openRow(screen, name) {
  const at = named(screen).indexOf(name)
  if (at === -1) throw new Error(`no row named ${name}`)
  tap(one(holdsOf(screen)[at], byClass('name'), 'name'))
}

/* Choosing rows. The row itself is the target: shift-click with a mouse, long press
   with a thumb. There is no column of checkboxes to aim at any more. */

/**
 * Every box now drawn, by what it stands for. A box belongs to an input, so an
 * ingredient's is in its row and a step's is in its cell, and only the things the open
 * step may take have one at all.
 */
function boxesOf(screen) {
  const names = named(screen)
  const found = []
  holdsOf(screen).forEach((hold, at) => {
    const box = all(hold).find(byClass('tick'))
    if (box) found.push({ what: names[at], box })
  })
  for (const cell of stepCells(screen)) {
    const box = all(cell).find(byClass('tick'))
    if (box) found.push({ what: says(cell, 'verb'), box })
  }
  return found
}

const ticked = (screen) => boxesOf(screen).filter((one) => one.box.checked).map((one) => one.what)
const offered = (screen) => boxesOf(screen).map((one) => one.what)

/** Tick or untick what a box stands for. */
function tick(screen, name) {
  const found = boxesOf(screen).find((one) => one.what === name)
  if (!found) throw new Error(`no box for ${name} among ${JSON.stringify(offered(screen))}`)
  found.box.checked = !found.box.checked
  return found.box.onclick({})
}

/** A step, taking whatever the editor guessed, opened and waiting for its name. */
const process = (screen) => tap(one(onlyTable(screen), byText('+ Step'), '+ Step'))

/** Every step cell of the one table, with the fields it is written in. */
/** What the editor drew, as the card's own text does not exist until it is saved. */
const plain = (node) => node.textContent.replace(/\u00a0/g, ' ')
const shown = (screen) => stepCells(screen).map((cell) => says(cell, 'verb'))
/** Every ingredient row of the one table, top to bottom, open or not. */
const named = (screen) => holdsOf(screen).map((hold) => says(hold, 'name'))

/** There is one table. An unused ingredient is a row in it, not a table of its own. */
function onlyTable(screen) {
  const grids = all(screen).filter(byClass('grid'))
  assert.equal(grids.length, 1, `${grids.length} tables, wanted 1`)
  return grids[0]
}
const faults = (screen) => all(screen).filter(byClass('fault')).map(plain)

test('an empty card offers only the two ways to add, and says so', () => {
  const { screen } = open('# Neu\n')
  assert.equal(shown(screen).length, 0)
  // A card just made is not scolded: the hint says what to do, and there is no fault.
  assert.deepEqual(faults(screen), [])
  assert.match(
    all(screen).filter(byClass('band')).at(-1).textContent,
    /Add an ingredient, then a step that takes it/,
  )
  // Saving nothing is not offered.
  assert.equal(one(screen, byText('Save'), 'Save').disabled, true)
})

test('ingredients entered one after another wait, and are named as unused', () => {
  const { screen } = open('# Neu\n')

  enter(screen, { amount: '250', unit: 'g', name: 'Mehl' })
  // A second row is a second `+ Ingredient`; there is no form to keep open.
  enter(screen, { amount: '500', unit: 'ml', name: 'Milch' })

  // Both are rows of the one table, with nothing to the right of them.
  onlyTable(screen)
  assert.deepEqual(named(screen), ['Mehl', 'Milch'])
  assert.deepEqual(faults(screen), [
    '250 g Mehl goes into no step',
    '500 ml Milch goes into no step',
  ])
  assert.equal(one(screen, byText('Save'), 'Save').disabled, true)
})

test('a new step takes what is waiting, and is then named', async () => {
  const { screen, saved } = open('# Neu\n')

  enter(screen, { amount: '250', unit: 'g', name: 'Mehl' })
  enter(screen, { amount: '500', unit: 'ml', name: 'Milch' })

  // No boxes until a step is open: there is nothing yet for one to be about.
  assert.deepEqual(offered(screen), [])

  // `+ Step` takes every ingredient still waiting, which is what is almost always meant.
  process(screen)
  assert.deepEqual(ticked(screen), ['Mehl', 'Milch'])
  nameStep(screen, 'verrühren')

  assert.deepEqual(shown(screen), ['verrühren'])
  assert.deepEqual(faults(screen), [])
  onlyTable(screen)
  // Committing clears the ticks, so the next move starts from nothing.
  assert.equal(all(screen).filter(byClass('takes')).length, 0)

  await one(screen, byText('Save'), 'Save').onclick()
  assert.deepEqual(saved, ['# Neu\n\n- verrühren\n  - Mehl: 250 g\n  - Milch: 500 ml\n'])
})

test('with nothing waiting, a new step takes the ends of the strands', () => {
  const { screen } = open(PANCAKES)

  // Every ingredient is already inside a step, so what is left to take is braten
  // itself - the end of the one strand there is.
  process(screen)
  assert.deepEqual(ticked(screen), ['braten'])
  nameStep(screen, 'anrichten')

  assert.deepEqual(faults(screen), [])
  assert.deepEqual(shown(screen).sort(), ['anrichten', 'braten', 'verrühren'])
})

test('two strands that never meet are refused until a step joins them', () => {
  const { screen } = open('# Reis mit Hähnchen\n')

  for (const [name, verb] of [['Reis', 'kochen'], ['Hähnchen', 'braten']]) {
    enter(screen, { name, amount: '200', unit: 'g' })
    process(screen)
    nameStep(screen, verb)
  }

  assert.deepEqual(shown(screen).sort(), ['braten', 'kochen'])
  assert.deepEqual(faults(screen), [
    'kochen and braten never meet. Add a step that takes them all',
  ])
  assert.equal(one(screen, byText('Save'), 'Save').disabled, true)

  // Ticking every row of both says both strands, which is how they are joined.
  // Neither ingredient is waiting any more, so the new step takes both ends at once,
  // which is how two strands are joined.
  process(screen)
  assert.deepEqual(ticked(screen).sort(), ['braten', 'kochen'])
  nameStep(screen, 'anrichten')

  assert.deepEqual(faults(screen), [])
  assert.equal(one(screen, byText('Save'), 'Save').disabled, false)
})

/* Editing what is already there: the tap leads back to the node the cell was drawn from. */

const PANCAKES = `# Pfannkuchen

- braten (2 min je Seite)
  - verrühren
    - Mehl: 250 g
    - Milch: 500 ml
`

test('every field of a row writes to the same ingredient', () => {
  const { screen } = open(PANCAKES)
  const row = rowOf(screen, 0)

  // The amount, the unit and the name are three cells of one line, so the row is read
  // back whole whichever of them the caret happens to leave.
  assert.equal(row.name.value, 'Mehl')
  assert.equal(row.amount.value, '250')
  assert.equal(row.unit.value, 'g')

  row.amount.value = '300'
  row.aside.value = 'Type 550'
  row.unit.onchange()

  const after = rowOf(screen, 0)
  assert.deepEqual(named(screen), ['Mehl', 'Milch'])
  assert.equal(after.amount.value, '300')
  assert.equal(after.aside.value, 'Type 550')
})

test('opening a step ticks what goes into it, and nothing moves until Apply', () => {
  const { screen } = open(PANCAKES)

  openStep(screen, 'verrühren')
  assert.deepEqual(ticked(screen), ['Mehl', 'Milch'])

  // Unticking changes the box and nothing else: the row stays where it is drawn.
  tick(screen, 'Milch')
  assert.deepEqual(ticked(screen), ['Mehl'])
  assert.deepEqual(named(screen), ['Mehl', 'Milch'])
  assert.deepEqual(faults(screen), [])

  // Applying is when it happens. Milch is still a row of the same table; it has simply
  // lost what was to its right.
  click(screen, 'Apply')
  onlyTable(screen)
  assert.deepEqual(named(screen), ['Mehl', 'Milch'])
  assert.deepEqual(faults(screen), ['500 ml Milch goes into no step'])
})

test('a box stands for an input, so what is inside another step has none', () => {
  const { screen } = open(WITH_BUTTER)

  // verrühren takes Mehl and Milch. Butter is inside schmelzen, which is inside braten,
  // which holds verrühren - it is not something verrühren could take, and unticking one
  // row of a strand is not a move the format has, so it is offered no box at all.
  openStep(screen, 'verrühren')
  assert.deepEqual(ticked(screen), ['Mehl', 'Milch'])
  assert.deepEqual(offered(screen), ['Mehl', 'Milch'])
})

test('deleting a step frees what it held instead of taking the strand with it', () => {
  const { screen } = open(PANCAKES)

  openStep(screen, 'braten')
  click(screen, 'Delete braten')

  assert.deepEqual(shown(screen), ['verrühren'])
  assert.deepEqual(faults(screen), [])
})

test('a note on a step is a field under its verb, in the cell', () => {
  const { screen } = open(PANCAKES)
  const step = stepNamed(screen, 'braten')
  assert.equal(step.note.value, '2 min je Seite')

  step.note.value = '3 min je Seite'
  step.note.onchange()
  assert.equal(stepNamed(screen, 'braten').note.value, '3 min je Seite')
})

test('punctuation the file would read as structure is refused while it is typed', async () => {
  const { screen, saved } = open('# Neu\n')

  enter(screen, { name: 'Salz: grob', amount: '1', unit: 'TL' })
  process(screen)
  nameStep(screen, 'würzen')

  // `- Salz: grob: 1 TL` splits at the first colon, so this card would come back as
  // salt in an amount of "grob" - and come back as the same text, so no round trip
  // would notice. It is caught for what it is: a colon inside a name.
  assert.deepEqual(faults(screen), ['A colon cannot be part of a name. Put it in the amount instead'])
  const save = one(screen, byText('Save'), 'Save')
  assert.equal(save.disabled, true)

  // The fault leads to the row it is about, where it can be fixed in place.
  tap(one(screen, byClass('fault'), 'fault'))
  write(screen, 0, { name: 'Salz', amount: 'grob', unit: '' })

  assert.deepEqual(faults(screen), [])
  await one(screen, byText('Save'), 'Save').onclick()
  assert.deepEqual(saved, ['# Neu\n\n- würzen\n  - Salz: grob\n'])
})

test('brackets in a name are refused too, and the note is offered instead', () => {
  const { screen } = open('# Neu\n')
  enter(screen, { name: 'Mehl (Type 550)' })
  assert.ok(
    faults(screen).includes('Brackets cannot be part of a name. Put it in the note instead'),
  )
})

test('the specification writes the yield, the notes and the preparations', () => {
  const { screen } = open('# Neu\n')

  enter(screen, { name: 'Teig' })
  process(screen)
  nameStep(screen, 'backen')

  type(screen, 'Yield', '1 Laib')
  type(screen, 'Before', 'Ofen vorheizen (240 °C)')

  // A preparation for the whole recipe is a row of the table that brings no ingredient.
  const band = one(onlyTable(screen), byClass('preparation'), 'preparation')
  assert.equal(plain(band), 'Ofen vorheizen240 °C')
  assert.deepEqual(faults(screen), [])
})

test('the name is a field of the editor, and an empty one is a fault', () => {
  const { screen } = open('# x\n')
  const name = one(screen, (node) => node.tag === 'input' && byClass('title')(node), 'name field')
  assert.equal(name.value, 'x')

  name.value = '  '
  name.onchange?.()
  assert.ok(all(screen).some((node) => node.textContent.includes('The recipe needs a name')))
})

test('nothing on this screen opens a dialog any more', () => {
  const { screen } = open('# Neu\n')
  enter(screen, { name: 'Teig' })
  process(screen)
  nameStep(screen, 'kneten')
  openStep(screen, 'kneten')
  assert.equal(descendants(body).filter((node) => node.tag === 'dialog').length, 0)
})

test('a save that arrives is said, and so is one that does not', async () => {
  const { screen, saved } = open(PANCAKES)
  const edit = () => {
    rename(screen, 'braten', 'anbraten')
  }

  // Nothing has changed yet, so there is nothing to save.
  assert.equal(one(screen, byText('Save'), 'Save').disabled, true)
  edit()
  assert.equal(one(screen, byText('Save'), 'Save').disabled, false)

  await one(screen, byText('Save'), 'Save').onclick()
  assert.equal(saved.length, 1)
  assert.equal(one(screen, byText('Saved.'), 'note').classList.contains('warning'), false)
  // Saved and unchanged again: there is nothing left to send.
  assert.equal(one(screen, byText('Save'), 'Save').disabled, true)
})

test('a write the server refuses leaves the draft alone and says why', async () => {
  const { screen, saved } = open(PANCAKES, 'Not saved. No connection.')
  rename(screen, 'braten', 'anbraten')

  await one(screen, byText('Save'), 'Save').onclick()
  assert.deepEqual(saved, [])
  assert.equal(one(screen, byText('Not saved. No connection.'), 'warning').classList.contains('warning'), true)
  // Still dirty, so it can be sent again once there is a connection.
  assert.equal(one(screen, byText('Save'), 'Save').disabled, false)
  assert.deepEqual(shown(screen), ['anbraten', 'verrühren'])
})

/* Partial overlap: the half of the move the cook did not point at. */

const WITH_BUTTER = `# Pfannkuchen

- braten (2 min je Seite)
  - verrühren
    - Mehl: 250 g
    - Milch: 500 ml
  - schmelzen
    - Butter: 30 g
`






test('the add-ingredient row sits under the last ingredient of the one table', () => {
  const { screen } = open('# Neu\n')
  const add = one(onlyTable(screen), byText('+ Ingredient'), 'add row')
  assert.ok(add.classList.contains('add'))

  tap(add)
  write(screen, 0, { name: 'Mehl' })
  assert.deepEqual(named(screen), ['Mehl'])
  // Still one table, and still exactly one of each way to add.
  assert.equal(all(onlyTable(screen)).filter(byText('+ Ingredient')).length, 1)
  assert.equal(all(onlyTable(screen)).filter(byText('+ Step')).length, 1)
})

test('a card is one table at every stage of being written', () => {
  const { screen } = open('# Neu\n')
  onlyTable(screen)

  for (const name of ['Reis', 'Hähnchen']) {
    enter(screen, { name })
    onlyTable(screen)
  }

  // Two strands that have not met is the case that used to draw two tables. The first
  // step takes both waiting ingredients, so one is untnicked to leave the other loose.
  process(screen)
  tick(screen, 'Hähnchen')
  click(screen, 'Apply')
  nameStep(screen, 'kochen')
  onlyTable(screen)

  process(screen)
  nameStep(screen, 'braten')
  onlyTable(screen)
  assert.deepEqual(faults(screen), [
    'kochen and braten never meet. Add a step that takes them all',
  ])
  assert.deepEqual(named(screen), ['Reis', 'Hähnchen'])
})

test('a step being edited starts from what it takes, not from what it contains', () => {
  const { screen } = open(WITH_BUTTER)
  openStep(screen, 'braten')
  // braten takes two strands, not three ingredients, so there are two boxes.
  assert.deepEqual(ticked(screen).sort(), ['schmelzen', 'verrühren'])
})

test('+ Step guesses what goes in, and says so with the boxes', () => {
  const { screen } = open(WITH_BUTTER)

  // Nothing is waiting, so the guess is the end of the strand, and the new step is
  // unnamed with the caret in it.
  process(screen)
  assert.deepEqual(ticked(screen), ['braten'])
  assert.equal(stepNamed(screen, '').verb.value, '')

  nameStep(screen, 'anrichten')
  assert.deepEqual(shown(screen).sort(), ['anrichten', 'braten', 'schmelzen', 'verrühren'])
})

test('a recipe with nothing in it is told to start with an ingredient', () => {
  const { screen } = open('# Neu\n')
  process(screen)
  assert.ok(all(screen).some((node) => node.textContent.includes('Add an ingredient first')))
})

test('an edit made while a save is in flight is not counted as saved', async () => {
  const { screen, saved, hold, let_go } = open(PANCAKES)
  const edit = (from, to) => rename(screen, from, to)

  edit('braten', 'anbraten')
  hold()
  const writing = one(screen, byText('Save'), 'Save').onclick()

  // While it is in flight the page is live, and Save must not invite a second write.
  assert.equal(one(screen, byText('Save'), 'Save').disabled, true)
  edit('anbraten', 'scharf anbraten')

  let_go()
  await writing

  assert.equal(saved.length, 1)
  // The card the server has is the old one, so there is still something to send.
  assert.equal(one(screen, byText('Save'), 'Save').disabled, false)
  assert.ok(all(screen).some((node) => node.textContent.includes('save again')))
})

test('the table keeps its place across a repaint', () => {
  const { screen } = open(PANCAKES)
  const scroller = () => one(screen, byClass('scroll'), 'scroll')

  scroller().scrollLeft = 240
  // Opening a cell repaints the whole table; a wide recipe must not jump back to its
  // first column while the cook is working across it.
  openStep(screen, 'verrühren')
  assert.equal(scroller().scrollLeft, 240)
})

/** `row / column / span rows / span columns`, as `renderGrid` writes it. */
const area = (node) => {
  const [row, column, rows, columns] = node.style.gridArea.split(' / ')
  return {
    row: Number(row),
    column: Number(column),
    rows: Number(rows.replace('span ', '')),
    columns: Number(columns.replace('span ', '')),
  }
}

test('the table has square edges: the add row and the step column reach them', () => {
  const { screen } = open(WITH_BUTTER)
  const grid = onlyTable(screen)
  const add = area(one(grid, byText('+ Ingredient'), '+ Ingredient'))
  const step = area(one(grid, byText('+ Step'), '+ Step'))

  // The add row starts at the very left, across the checkbox column, or it leaves a notch.
  assert.equal(add.column, 1)
  // The step column runs from under the header to the same last row as the add row.
  assert.equal(step.row, 2)
  assert.equal(step.row + step.rows - 1, add.row)
  // And the rest of the add row is drawn, so the bottom edge runs the whole width.
  const along = all(grid)
    .filter((node) => byClass('free')(node) && area(node).row === add.row)
    .map(area)
  assert.equal(along.length, 1)
  assert.equal(add.column + add.columns, along[0].column)
  assert.equal(along[0].column + along[0].columns, step.column)

  // A row with something under it keeps its rule: only the bottom row drops one.
  const rows = all(grid).filter(byClass('noun')).map((node) => node.parent)
  assert.ok(rows.every((node) => !node.classList.contains('lowest')))
  assert.ok(one(grid, byText('+ Ingredient'), 'add').classList.contains('lowest'))
})

test('deleting says what else it would take, and does nothing if refused', () => {
  const { screen } = open(`# A

- anrichten (heiß)
  - verrühren
    - Mehl: 250 g
`)
  asked = []
  globalThis.confirm.answer = false

  openRow(screen, 'Mehl')
  click(screen, 'Delete 250 g Mehl')

  // Mehl is all verrühren holds and verrühren is all anrichten holds, so deleting one
  // ingredient would take the whole recipe. It says so, and it asks first.
  assert.equal(asked.length, 1)
  assert.match(asked[0], /verrühren, anrichten/)
  assert.deepEqual(shown(screen).sort(), ['anrichten', 'verrühren'])

  // Answering yes goes through with it. The row is still ticked: a refusal changes
  // nothing, the choice included.
  globalThis.confirm.answer = true
  click(screen, 'Delete 250 g Mehl')
  assert.deepEqual(shown(screen), [])
})

test('deleting something that empties nothing does not ask', () => {
  const { screen } = open(WITH_BUTTER)
  asked = []
  openRow(screen, 'Mehl')
  click(screen, 'Delete 250 g Mehl')
  assert.deepEqual(asked, [])
  assert.deepEqual(shown(screen).sort(), ['braten', 'schmelzen', 'verrühren'])
})

test('a save that throws does not wedge the editor', async () => {
  const { screen } = open(PANCAKES, null, true)
  rename(screen, 'braten', 'anbraten')

  await one(screen, byText('Save'), 'Save').onclick()

  // Save comes back rather than staying down for the life of the editor, and the reason
  // is on the screen rather than nowhere.
  assert.equal(one(screen, byText('Save'), 'Save').disabled, false)
  assert.ok(all(screen).some((node) => node.textContent.includes('storage is full')))
})
