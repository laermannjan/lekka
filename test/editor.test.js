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

/** What a row of the specification reads, or null when the recipe has no answer. */
function said(screen, name) {
  const spec = one(screen, byClass('spec'), 'specification')
  const at = spec.children.findIndex((node) => byClass('label')(node) && node.textContent === name)
  return at === -1 ? null : plain(spec.children[at + 1])
}

/* A bar holding one button reads as that button, so a press means the button. */
const click = (root, text) => {
  const found = all(root).filter(byText(text))
  return tap(found.find((node) => node.tag === 'button') ?? one(root, byText(text), `"${text}"`))
}
/*
 * Writing. Nothing in the table is a field: a tap on a row or a step opens the form,
 * which is where every field is, and `Apply` is the only thing that writes.
 */

const holdsOf = (screen) => all(onlyTable(screen)).filter(byClass('hold'))
// `+ Step` is `add step`, and is a button rather than a cell.
const stepCells = (screen) =>
  all(onlyTable(screen)).filter((node) => byClass('step')(node) && !byClass('add')(node))

/** What a cell of the table says. The table is only ever read, so this is only ever text. */
function says(cell, kind) {
  const shownAs = all(cell).find(byClass(kind === 'verb' ? 'verb' : 'noun'))
  return shownAs ? plain(shownAs) : ''
}

/** The form now open, or null. There is at most one: opening a second closes the first. */
const formOpen = () => descendants(body).find((node) => node.tag === 'dialog' && node.open) ?? null

/** The one form: its heading, its fields by the names written above them, its buttons. */
function held() {
  const box = formOpen()
  if (!box) throw new Error('no form is open')
  const fields = all(box).filter((node) => node.tag === 'input' || node.tag === 'textarea')
  const named = (name) => fields.find(byClass(name))
  return {
    box,
    kind: one(box, byClass('kind'), 'kind').textContent,
    place: one(box, byClass('place'), 'place').textContent,
    amount: named('amount'),
    unit: named('unit'),
    name: named('name'),
    aside: named('aside'),
    verb: named('verb'),
    before: fields.filter(byClass('before')),
    apply: () => click(box, 'Apply'),
    leave: () => click(box, 'Close'),
    erase: () => click(box, 'Delete'),
  }
}

/** Open the row whose name reads this. */
function openRow(screen, name) {
  const at = named(screen).indexOf(name)
  if (at === -1) throw new Error(`no row named ${name} among ${JSON.stringify(named(screen))}`)
  tap(holdsOf(screen)[at])
  return held()
}

/** Open the nth row, top to bottom. */
function openAt(screen, index) {
  const hold = holdsOf(screen)[index]
  if (!hold) throw new Error(`no row ${index} of ${holdsOf(screen).length}`)
  tap(hold)
  return held()
}

/** The step cell whose verb reads this. */
function cellNamed(screen, verb) {
  const found = stepCells(screen).find((cell) => says(cell, 'verb') === verb)
  if (!found)
    throw new Error(`no step "${verb}" among ${JSON.stringify(stepCells(screen).map((c) => says(c, 'verb')))}`)
  return found
}

/** Open the step whose verb reads this. */
function openStep(screen, verb) {
  tap(cellNamed(screen, verb))
  return held()
}

/** Type into the open form and press Apply, which is the only thing that writes. */
function fill(values) {
  const form = held()
  for (const [key, value] of Object.entries(values)) {
    if (key === 'before') form.before.at(-1).value = value
    else form[key].value = value
  }
  form.apply()
}

/** Add an ingredient the way a person does: a row, then the form it opens. */
function enter(screen, values) {
  click(screen, '+ Ingredient')
  fill(values)
}

/** Name the step that has no name yet: the one `+ Step` has just made. */
function nameStep(screen, verb, values = {}) {
  fill({ verb, ...values })
}

/** Rename a step where it stands. */
function rename(screen, from, to) {
  openStep(screen, from)
  fill({ verb: to })
}

/**
 * Every box the open form offers, by what it stands for. A box belongs to an input, and
 * a step takes whole strands, so what is offered is a strand and never a row inside one.
 */
function boxesOf() {
  return all(held().box)
    .filter(byClass('choice'))
    .map((line) => ({
      what: one(line, byClass('what'), 'what').textContent,
      box: one(line, (node) => node.type === 'checkbox', 'box'),
    }))
}

const ticked = () => boxesOf().filter((one) => one.box.checked).map((one) => one.what)
const offered = () => boxesOf().map((one) => one.what)

/** Tick or untick what a box stands for. */
function tick(name) {
  const found = boxesOf().find((one) => one.what === name)
  if (!found) throw new Error(`no box for ${name} among ${JSON.stringify(offered())}`)
  found.box.checked = !found.box.checked
  return found.box.onchange()
}

/** A step, taking whatever the editor guessed, with the form open and no name yet. */
const process = (screen) => tap(one(onlyTable(screen), byText('+ Step'), '+ Step'))

/** What the editor drew, as the card's own text does not exist until it is saved. */
const plain = (node) => node.textContent.replace(/ /g, ' ')
const shown = (screen) => stepCells(screen).map((cell) => says(cell, 'verb'))
/** Every ingredient row of the one table, top to bottom. */
const named = (screen) => holdsOf(screen).map((hold) => says(hold, 'name'))

/** What the table shades: everything coming into the step the form is open on. */
const shaded = (screen) => [
  ...holdsOf(screen).filter(byClass('chosen')).map((hold) => says(hold, 'name')),
  ...stepCells(screen).filter(byClass('chosen')).map((cell) => says(cell, 'verb')),
]

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

  // No boxes until a step is open: they are in the form, and no form is up.
  assert.equal(formOpen(), null)

  // `+ Step` takes every ingredient still waiting, which is what is almost always meant.
  process(screen)
  assert.deepEqual(ticked(), ['250 g Mehl', '500 ml Milch'])
  nameStep(screen, 'verrühren')

  assert.deepEqual(shown(screen), ['verrühren'])
  assert.deepEqual(faults(screen), [])
  onlyTable(screen)
  // Applying closes the form, so the next move starts from the table again.
  assert.equal(formOpen(), null)

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

test('a row is one line of the card, and the form writes all four of its fields', () => {
  const { screen } = open(PANCAKES)
  const row = openRow(screen, 'Mehl')

  // The amount, the unit and the name are three cells of one line, not three things, so
  // the form holds the line and `Apply` writes the whole of it.
  assert.equal(row.kind, 'Ingredient')
  assert.equal(row.name.value, 'Mehl')
  assert.equal(row.amount.value, '250')
  assert.equal(row.unit.value, 'g')

  fill({ amount: '300', aside: 'Type 550' })

  assert.deepEqual(named(screen), ['Mehl', 'Milch'])
  const after = openRow(screen, 'Mehl')
  assert.equal(after.amount.value, '300')
  assert.equal(after.aside.value, 'Type 550')
})

test('nothing in the table is a field, so nothing in it can change shape', () => {
  const { screen } = open(PANCAKES)

  const before = holdsOf(screen).length
  openStep(screen, 'verrühren')

  // The form is a layer over the page. The table under it has the same rows, the same
  // cells and not one field: only its colours differ.
  assert.equal(holdsOf(screen).length, before)
  assert.equal(all(onlyTable(screen)).filter(byClass('field')).length, 0)
  assert.equal(all(onlyTable(screen)).filter((node) => node.tag === 'input').length, 0)
  assert.equal(all(onlyTable(screen)).filter((node) => node.tag === 'textarea').length, 0)
})

test('a step is written in the form, and the table says so until Apply', () => {
  const { screen } = open(PANCAKES)
  const step = openStep(screen, 'verrühren')
  assert.equal(step.kind, 'Step')
  assert.equal(step.place, 'column 01')
  assert.equal(step.verb.value, 'verrühren')

  // Nothing has moved yet: the table still says what it said.
  assert.deepEqual(shown(screen), ['braten', 'verrühren'])

  fill({ verb: 'vermengen' })
  assert.deepEqual(shown(screen), ['braten', 'vermengen'])
  assert.equal(formOpen(), null)
})

test('opening a step ticks what goes into it, and nothing moves until Apply', () => {
  const { screen } = open(PANCAKES)

  const step = openStep(screen, 'verrühren')
  assert.deepEqual(ticked(), ['250 g Mehl', '500 ml Milch'])

  // Unticking changes the box and nothing else: the row stays where it is drawn.
  tick('500 ml Milch')
  assert.deepEqual(ticked(), ['250 g Mehl'])
  assert.deepEqual(named(screen), ['Mehl', 'Milch'])
  assert.deepEqual(faults(screen), [])

  // Applying is when it happens. Milch is still a row of the same table; it has simply
  // lost what was to its right.
  step.apply()
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
  assert.deepEqual(ticked(), ['250 g Mehl', '500 ml Milch'])
  assert.deepEqual(offered(), ['250 g Mehl', '500 ml Milch'])
})

test('the form says what kind of thing it holds and where it stands', () => {
  const { screen } = open(PANCAKES)

  // The kind and the column, and not the name: the name is in a field two lines below,
  // and a heading that repeats the field under it is one more thing to keep in step.
  const step = openStep(screen, 'braten')
  assert.equal(step.kind, 'Step')
  assert.equal(step.place, 'column 02')
  assert.equal(plain(one(step.box, byClass('at'), 'heading')).includes('braten'), false)

  const row = openRow(screen, 'Mehl')
  assert.equal(row.kind, 'Ingredient')
  // A row stands in no column of its own: it is the line the columns are measured from.
  assert.equal(row.place, '')
  // And it takes nothing, so it is offered no list.
  assert.equal(all(row.box).filter(byClass('choice')).length, 0)
})

test('opening a second form closes the first', () => {
  const { screen } = open(PANCAKES)
  const step = openStep(screen, 'braten')
  const row = openRow(screen, 'Mehl')

  assert.equal(step.box.open, false)
  assert.equal(row.box.open, true)
  assert.equal(descendants(body).filter((node) => node.tag === 'dialog' && node.open).length, 1)
})

test('deleting a step frees what it held instead of taking the strand with it', () => {
  const { screen } = open(PANCAKES)

  openStep(screen, 'braten').erase()

  assert.deepEqual(shown(screen), ['verrühren'])
  assert.deepEqual(faults(screen), [])
  assert.equal(formOpen(), null)
})

test('a note on a step is a field of the form, under the verb', () => {
  const { screen } = open(PANCAKES)
  const step = openStep(screen, 'braten')
  assert.equal(step.aside.value, '2 min je Seite')

  fill({ aside: '3 min je Seite' })
  assert.equal(openStep(screen, 'braten').aside.value, '3 min je Seite')
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

  // The fault leads to the row it is about: it opens the form on that one row.
  tap(one(screen, byClass('fault'), 'fault'))
  assert.equal(held().kind, 'Ingredient')
  fill({ name: 'Salz', amount: 'grob', unit: '' })

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

  // A preparation for the whole recipe stands over the ingredient block, which is what
  // comes before every column there is.
  const band = one(onlyTable(screen), byClass('preparation'), 'preparation')
  assert.equal(plain(band), 'Ofen vorheizen240 °C')
  assert.ok(band.classList.contains('whole'))
  assert.deepEqual(faults(screen), [])
})

test("a step's preparation is drawn over its column, not inside its cell", () => {
  const { screen } = open('# Neu\n')
  enter(screen, { name: 'Teig' })
  process(screen)
  nameStep(screen, 'backen', { before: 'Ofen vorheizen (240 °C)' })

  // In the band, over the column `backen` is standing in - and nothing in the cell.
  const band = one(onlyTable(screen), byClass('preparation'), 'preparation')
  assert.equal(plain(band), 'Ofen vorheizen240 °C')
  assert.equal(band.classList.contains('whole'), false)
  assert.equal(all(cellNamed(screen, 'backen')).filter(byClass('preparation')).length, 0)

  // And it is written in the step's own form, because that is what it belongs to.
  assert.deepEqual(openStep(screen, 'backen').before.map((one) => one.value), ['Ofen vorheizen (240 °C)', ''])
})

test('the card says only what a person wrote about it, never a sum', () => {
  const { screen } = open(PANCAKES)

  // How long it takes, what it weighs, how many rows it has - all true, none of it
  // wanted. A cook reads the table; a count of its rows is a fact about the drawing.
  for (const sum of ['Time', 'Weight', 'Liquid', 'Ingredients', 'Steps'])
    assert.equal(said(screen, sum), null, sum)

  // What is left is the yield, the notes and the recipe's own preparations, which is
  // everything that can only be typed here.
  assert.notEqual(said(screen, 'Yield'), null)
  assert.notEqual(said(screen, 'Note'), null)
})

test('a name is trimmed as it is written, so Save is not refused over a space', () => {
  const { screen } = open('# x\n')
  const name = one(screen, (node) => node.tag === 'input' && byClass('title')(node), 'name field')
  name.value = 'Brot '
  name.onchange()

  const after = one(screen, (node) => node.tag === 'input' && byClass('title')(node), 'name field')
  assert.equal(after.value, 'Brot')
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

test('the form is the one dialog, and it is up only when it was asked for', () => {
  const { screen } = open('# Neu\n')
  enter(screen, { name: 'Teig' })
  assert.equal(formOpen(), null)

  process(screen)
  nameStep(screen, 'kneten')
  assert.equal(formOpen(), null)

  const step = openStep(screen, 'kneten')
  assert.equal(formOpen(), step.box)
  step.leave()
  assert.equal(formOpen(), null)
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
  fill({ name: 'Mehl' })
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
  tick('Hähnchen')
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

test('a ticked strand is shaded whole, steps between it and the rows included', () => {
  const { screen } = open(WITH_BUTTER)
  openStep(screen, 'braten')

  // braten takes verrühren and schmelzen. Both are shaded, and so is every row under
  // them: what is coming in is the strand, not the boxes that name it.
  const shadedSteps = stepCells(screen)
    .filter(byClass('chosen'))
    .map((cell) => says(cell, 'verb'))
  assert.deepEqual(shadedSteps.sort(), ['schmelzen', 'verrühren'])
  assert.equal(holdsOf(screen).filter(byClass('chosen')).length, named(screen).length)

  // The step being written is not shaded: the shading says what is coming in.
  assert.ok(!byClass('chosen')(cellNamed(screen, 'braten')))
})

test('a step being edited starts from what it takes, not from what it contains', () => {
  const { screen } = open(WITH_BUTTER)
  openStep(screen, 'braten')
  // braten takes two strands, not three ingredients, so there are two boxes.
  assert.deepEqual(ticked().sort(), ['schmelzen', 'verrühren'])
})

test('a step input says how much it brings; an ingredient brings one row and says nothing', () => {
  const { screen } = open(WITH_BUTTER)
  openStep(screen, 'braten')

  // `verrühren` holds two ingredients and `schmelzen` one, and neither can be seen from
  // its name. A list that also said `1 row` beside every ingredient would be a column of
  // the word row, so only the counts worth reading are printed.
  const beside = (what) =>
    all(held().box)
      .filter(byClass('choice'))
      .filter((line) => plain(one(line, byClass('what'), 'what')) === what)
      .flatMap((line) => all(line).filter(byClass('aside')).map(plain))
  assert.deepEqual(beside('verrühren'), ['2 ingredients'])
  assert.deepEqual(beside('schmelzen'), [])

  openStep(screen, 'verrühren')
  assert.deepEqual(beside('250 g Mehl'), [])
})

test('+ Step guesses what goes in, and says so with the boxes', () => {
  const { screen } = open(WITH_BUTTER)

  // Nothing is waiting, so the guess is the end of the strand, and the new step is
  // unnamed with the form on it.
  process(screen)
  assert.deepEqual(ticked(), ['braten'])
  assert.equal(held().verb.value, '')

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

  openRow(screen, 'Mehl').erase()

  // Mehl is all verrühren holds and verrühren is all anrichten holds, so deleting one
  // ingredient would take the whole recipe. It says so, and it asks first.
  assert.equal(asked.length, 1)
  assert.match(asked[0], /verrühren, anrichten/)
  assert.deepEqual(shown(screen).sort(), ['anrichten', 'verrühren'])

  // A refusal changes nothing, the form included: it is still open on the same row.
  assert.equal(held().kind, 'Ingredient')

  // Answering yes goes through with it.
  globalThis.confirm.answer = true
  held().erase()
  assert.deepEqual(shown(screen), [])
  assert.equal(formOpen(), null)
})

test('deleting something that empties nothing does not ask', () => {
  const { screen } = open(WITH_BUTTER)
  asked = []
  openRow(screen, 'Mehl').erase()
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
