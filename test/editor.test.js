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

const click = (root, text) => tap(one(root, byText(text), `"${text}"`))
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

/** Shift on a step says "these rows are what goes into it". */
const openStep = (screen, verb) => tap(cellNamed(screen, verb), { shiftKey: true })

/* Choosing rows. The row itself is the target: shift-click with a mouse, long press
   with a thumb. There is no column of checkboxes to aim at any more. */

/** Choose the row whose ingredient name matches, by its box, as a hand would. */
function tick(screen, name, shift = false) {
  const at = named(screen).indexOf(name)
  if (at === -1) throw new Error(`no row named ${name}`)
  const box = one(holdsOf(screen)[at], byClass('tick'), `tick for ${name}`)
  box.checked = !box.checked
  return box.onclick({ shiftKey: shift })
}

const process = (screen) => click(screen, 'Process in step')

/** Every step cell of the one table, with the fields it is written in. */
const takes = (screen) => one(screen, byClass('takes'), 'takes').textContent

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

test('ticking rows and processing them builds the step', async () => {
  const { screen, saved } = open('# Neu\n')

  enter(screen, { amount: '250', unit: 'g', name: 'Mehl' })
  enter(screen, { amount: '500', unit: 'ml', name: 'Milch' })

  // Nothing ticked, nothing offered: the table is quiet until the cook has said what
  // they mean.
  assert.equal(all(screen).filter(byClass('takes')).length, 0)

  tick(screen, 'Mehl')
  assert.equal(takes(screen), '250 g Mehl')
  tick(screen, 'Milch')
  assert.equal(takes(screen), '250 g Mehl + 500 ml Milch')

  process(screen)
  nameStep(screen, 'verrühren')

  assert.deepEqual(shown(screen), ['verrühren'])
  assert.deepEqual(faults(screen), [])
  onlyTable(screen)
  // Committing clears the ticks, so the next move starts from nothing.
  assert.equal(all(screen).filter(byClass('takes')).length, 0)

  await one(screen, byText('Save'), 'Save').onclick()
  assert.deepEqual(saved, ['# Neu\n\n- verrühren\n  - Mehl: 250 g\n  - Milch: 500 ml\n'])
})

test('a row stands for whatever is holding it, so a whole strand reads as its last step', () => {
  const { screen } = open(PANCAKES)

  // Mehl is inside verrühren, which is inside braten. Ticking every row of the card
  // therefore says braten, not four ingredients.
  for (const name of ['Mehl', 'Milch']) tick(screen, name)
  assert.equal(takes(screen), 'braten')

  // Just the rows under verrühren say verrühren.
  tick(screen, 'Milch')
  assert.equal(takes(screen), '250 g Mehl')
})

test('two strands that never meet are refused until a step joins them', () => {
  const { screen } = open('# Reis mit Hähnchen\n')

  for (const [name, verb] of [['Reis', 'kochen'], ['Hähnchen', 'braten']]) {
    enter(screen, { name, amount: '200', unit: 'g' })
    tick(screen, name)
    process(screen)
    nameStep(screen, verb)
  }

  assert.deepEqual(shown(screen).sort(), ['braten', 'kochen'])
  assert.deepEqual(faults(screen), [
    'kochen and braten never meet. Add a step that takes them all',
  ])
  assert.equal(one(screen, byText('Save'), 'Save').disabled, true)

  // Ticking every row of both says both strands, which is how they are joined.
  tick(screen, 'Reis')
  tick(screen, 'Hähnchen')
  assert.equal(takes(screen), 'kochen + braten')

  process(screen)
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

test('a step being edited starts from its own rows, and refuses the strand it sits in', () => {
  const { screen } = open(PANCAKES)

  // Shift on the step ticks what it holds, and the bar says so.
  openStep(screen, 'verrühren')
  assert.equal(takes(screen), '250 g Mehl + 500 ml Milch')

  // Dropping an input hands it back to the waiting list rather than deleting it.
  tick(screen, 'Milch')
  click(screen, 'Apply')

  // Milch is still a row of the same table; it has simply lost what was to its right.
  onlyTable(screen)
  assert.deepEqual(named(screen), ['Mehl', 'Milch'])
  assert.deepEqual(faults(screen), ['500 ml Milch goes into no step'])
})

test('a row already inside the step above cannot be fed to the one below it', () => {
  const { screen } = open(WITH_BUTTER)

  // Butter belongs to schmelzen, which belongs to braten, which holds verrühren.
  // Feeding it to verrühren would be a loop, so it is refused rather than dropped.
  openStep(screen, 'verrühren')
  tick(screen, 'Butter')
  click(screen, 'Apply')

  assert.ok(all(screen).some((node) => node.textContent.includes('cannot go into verrühren')))
  assert.deepEqual(shown(screen).sort(), ['braten', 'schmelzen', 'verrühren'])
})

test('deleting a step frees what it held instead of taking the strand with it', () => {
  const { screen } = open(PANCAKES)

  openStep(screen, 'braten')
  click(screen, 'Delete step')

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
  tick(screen, 'Salz: grob')
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
  tick(screen, 'Teig')
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
  tick(screen, 'Teig')
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

test('taking one row out of a step is said before it happens, and then done', () => {
  const { screen } = open(WITH_BUTTER)

  tick(screen, 'Mehl')
  assert.equal(takes(screen), '250 g Mehl')
  // The bar names what it would disturb, since that is what was not pointed at.
  assert.ok(
    all(screen).some((node) => node.textContent.includes('250 g Mehl comes out of verrühren')),
  )

  process(screen)
  nameStep(screen, 'sieben')

  assert.deepEqual(shown(screen).sort(), ['braten', 'schmelzen', 'sieben', 'verrühren'])
  assert.deepEqual(faults(screen), [
    'braten and sieben never meet. Add a step that takes them all',
  ])
})

test('a step left empty by the move is named, and goes with it', () => {
  const { screen } = open(WITH_BUTTER)

  // Butter is all that schmelzen holds, so ticking its row reads as schmelzen itself,
  // and taking schmelzen whole is what keeps it from being emptied.
  tick(screen, 'Butter')
  assert.equal(takes(screen), 'schmelzen')
  assert.ok(
    all(screen).some((node) => node.textContent.includes('schmelzen comes out of braten')),
  )
  assert.ok(!all(screen).some((node) => node.textContent.includes('left empty')))

  process(screen)
  nameStep(screen, 'bräunen')

  assert.deepEqual(shown(screen).sort(), ['braten', 'bräunen', 'schmelzen', 'verrühren'])
})

test('naming the last ingredient of a step warns that the step goes too', () => {
  const { screen } = open(WITH_BUTTER)

  // Mehl and Butter together: Mehl comes out of verrühren, and Butter is all that
  // schmelzen holds, so schmelzen is left with nothing.
  tick(screen, 'Mehl')
  tick(screen, 'Butter')
  assert.equal(takes(screen), '250 g Mehl + schmelzen')

  process(screen)
  nameStep(screen, 'mischen')
  assert.deepEqual(shown(screen).sort(), ['braten', 'mischen', 'schmelzen', 'verrühren'])
})

test('the box at the head of the column takes every row, and lets them go again', () => {
  const { screen } = open(WITH_BUTTER)
  // The head of the tick column, which is the one box outside any row.
  const all_ = () =>
    all(onlyTable(screen)).filter((node) => byClass('tick')(node) && !byClass('hold')(node.parent.parent))[0]

  const box = all_()
  box.checked = true
  box.onclick({})
  assert.equal(takes(screen), 'braten')

  const again = all_()
  again.checked = false
  again.onclick({})
  assert.equal(all(screen).filter(byClass('takes')).length, 0)
})

test('shift extends from the last row touched', () => {
  const { screen } = open(`# A

- rühren
  - Mehl: 1 g
  - Milch: 2 g
  - Salz: 3 g
  - Zucker: 4 g
`)

  tick(screen, 'Mehl')
  tick(screen, 'Salz', true)
  // Mehl, Milch and Salz, but not Zucker.
  assert.equal(takes(screen), '1 g Mehl + 2 g Milch + 3 g Salz')
})

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

  // Two strands that have not met is the case that used to draw two tables.
  for (const [name, verb] of [['Reis', 'kochen'], ['Hähnchen', 'braten']]) {
    tick(screen, name)
    process(screen)
    nameStep(screen, verb)
    onlyTable(screen)
  }
  assert.deepEqual(faults(screen), [
    'kochen and braten never meet. Add a step that takes them all',
  ])
  assert.deepEqual(named(screen), ['Reis', 'Hähnchen'])
})

test('a step being edited starts from everything it holds, however deep', () => {
  const { screen } = open(WITH_BUTTER)
  openStep(screen, 'braten')
  assert.equal(takes(screen), 'verrühren + schmelzen')
})

test('a step needs rows, and + Step says so before it does nothing', () => {
  const { screen } = open(WITH_BUTTER)

  // The affordance is there at rest: nothing has been ticked, and nothing needs to be.
  const add = one(onlyTable(screen), byText('+ Step'), '+ Step')
  assert.equal(all(screen).filter(byClass('takes')).length, 0)

  tap(add)
  assert.ok(all(screen).some((node) => node.textContent.includes('Tick the rows')))

  // With rows ticked it takes them, and the new step is waiting for its name.
  tick(screen, 'Butter')
  tap(one(onlyTable(screen), byText('+ Step'), '+ Step'))
  assert.equal(stepNamed(screen, '').verb.value, '')
  nameStep(screen, 'sieben')
  assert.deepEqual(shown(screen).sort(), ['braten', 'schmelzen', 'sieben', 'verrühren'])
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
  // Ticking repaints the whole table; a wide card must not jump back to its first
  // column while the cook is working across it.
  tick(screen, 'Mehl')
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

  tick(screen, 'Mehl')
  click(screen, 'Delete')

  // Mehl is all verrühren holds and verrühren is all anrichten holds, so deleting one
  // ingredient would take the whole card. It says so, and it asks first.
  assert.equal(asked.length, 1)
  assert.match(asked[0], /verrühren, anrichten/)
  assert.deepEqual(shown(screen).sort(), ['anrichten', 'verrühren'])

  // Answering yes goes through with it. The row is still ticked: a refusal changes
  // nothing, the choice included.
  globalThis.confirm.answer = true
  click(screen, 'Delete')
  assert.deepEqual(shown(screen), [])
})

test('deleting something that empties nothing does not ask', () => {
  const { screen } = open(WITH_BUTTER)
  asked = []
  tick(screen, 'Mehl')
  click(screen, 'Delete')
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
