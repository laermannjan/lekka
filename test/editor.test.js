import test from 'node:test'
import assert from 'node:assert/strict'

import { install, all, one, tap, byText, byClass, descendants } from './dom.js'

const body = install()
const { parseCard } = await import('../app/card.js')
const { toDraft } = await import('../app/edit.js')
const { buildEditor } = await import('../app/editor.js')

/** The editor, and whatever it last tried to save. */
function open(text, refuse = null) {
  body.replaceChildren()
  const saved = []
  let release = null
  const screen = buildEditor({
    draft: toDraft(parseCard(text)),
    onSave: async (written) => {
      // A write that does not resolve until the test says so, for the window in which
      // the page is still live.
      if (release) await new Promise((go) => (release = go))
      if (refuse) return refuse
      saved.push(written)
    },
    onClose: () => saved.push(null),
  })
  return { screen, saved, hold: () => (release = () => {}), let_go: () => release?.() }
}

const sheet = () => one(body, (node) => node.tag === 'dialog', 'sheet')
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

/* Ticking rows. A row is the ingredient; the checkbox cell beside it is the target. */

const rows = (screen) =>
  all(screen).filter(byClass('choose')).slice(0)

/** Tick the row whose ingredient name matches, in the order the tables are drawn. */
function tick(screen, name, shift = false) {
  const grid = onlyTable(screen)
  const at = named(grid).indexOf(name)
  if (at === -1) throw new Error(`no row named ${name}`)
  // The first choose cell is the header, which takes every row at once.
  return tap(all(grid).filter(byClass('choose'))[at + 1], { shiftKey: shift })
}

const process = (screen) => click(screen, 'Process in step')
const takes = (screen) => one(screen, byClass('takes'), 'takes').textContent

/** The tick list. The read-only summary of what was taken is `.choice.taken`. */
const choices = () =>
  all(sheet())
    .filter((node) => byClass('choice')(node) && !byClass('taken')(node))
    .map((line) => ({
      text: line.children[1].textContent,
      carries: line.children[2]?.textContent ?? null,
      box: line.children[0],
    }))

/** What the editor drew, as the card's own text does not exist until it is saved. */
const plain = (node) => node.textContent.replace(/\u00a0/g, ' ')
const shown = (screen) => all(screen).filter(byClass('verb')).map(plain)
/** Every ingredient row of the one table, top to bottom. */
const named = (screen) => all(screen).filter(byClass('noun')).map((node) => node.textContent)

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

  click(screen, '+ Ingredient')
  fill({ Amount: '250', Unit: 'g', Name: 'Mehl' })
  // "Add and another" keeps the sheet open, which is what entering a list needs.
  one(sheet(), byText('Add and another'), 'another').onclick()
  fill({ Amount: '500', Unit: 'ml', Name: 'Milch' })
  submit()

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

  click(screen, '+ Ingredient')
  fill({ Amount: '250', Unit: 'g', Name: 'Mehl' })
  submit()
  click(screen, '+ Ingredient')
  fill({ Amount: '500', Unit: 'ml', Name: 'Milch' })
  submit()

  // Nothing ticked, nothing offered: the table is quiet until the cook has said what
  // they mean.
  assert.equal(all(screen).filter(byClass('takes')).length, 0)

  tick(screen, 'Mehl')
  assert.equal(takes(screen), '250 g Mehl')
  tick(screen, 'Milch')
  assert.equal(takes(screen), '250 g Mehl + 500 ml Milch')

  process(screen)
  fill({ Instruction: 'verrühren' })
  submit()

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
    click(screen, '+ Ingredient')
    fill({ Name: name, Amount: '200', Unit: 'g' })
    submit()
    tick(screen, name)
    process(screen)
    fill({ Instruction: verb })
    submit()
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
  fill({ Instruction: 'anrichten' })
  submit()

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

test('tapping an ingredient opens it, and every field of the row opens the same one', () => {
  const { screen } = open(PANCAKES)
  const row = all(screen).filter((node) => byClass('pickable')(node) && node.tag === 'div')

  const mehl = row.filter((node) => node.textContent.includes('Mehl'))
  assert.equal(mehl.length, 1)

  // The amount, the unit and the name are three cells of one line, so all three lead
  // to the ingredient rather than to a cell of their own.
  tap(one(screen, (node) => byClass('amount')(node) && node.textContent === '250', 'amount'))
  const form = fill({})
  assert.equal(field(form, 'Name').value, 'Mehl')
  assert.equal(field(form, 'Unit').value, 'g')

  field(form, 'Amount').value = '300'
  field(form, 'Note').value = 'Type 550'
  submit()

  const named = all(screen).filter(byClass('noun')).map((node) => node.textContent)
  assert.deepEqual(named, ['Mehl', 'Milch'])
  assert.ok(all(screen).some((node) => byClass('amount')(node) && node.textContent === '300'))
  assert.ok(all(screen).some((node) => byClass('aside')(node) && node.textContent === 'Type 550'))
})

test('a step being edited sees its own inputs, and never the strand it sits in', () => {
  const { screen } = open(PANCAKES)

  tap(one(screen, (node) => byClass('verb')(node) && node.textContent === 'verrühren', 'verb'))
  assert.deepEqual(choices().map((choice) => choice.text), ['250 g Mehl', '500 ml Milch'])

  // braten holds verrühren, so offering it here would make a loop. It is not on the list.
  assert.ok(!choices().some((choice) => choice.text.includes('braten')))

  // Dropping an input hands it back to the waiting list rather than deleting it.
  choices()[1].box.checked = false
  fill({ Instruction: 'verrühren' })
  submit()

  // Milch is still a row of the same table; it has simply lost what was to its right.
  onlyTable(screen)
  assert.deepEqual(named(screen), ['Mehl', 'Milch'])
  assert.deepEqual(faults(screen), ['500 ml Milch goes into no step'])
})

test('deleting a step frees what it held instead of taking the strand with it', () => {
  const { screen } = open(PANCAKES)

  tap(one(screen, (node) => byClass('verb')(node) && node.textContent === 'braten', 'braten'))
  tap(one(sheet(), byText('Delete'), 'Delete'))

  assert.deepEqual(shown(screen), ['verrühren'])
  assert.deepEqual(faults(screen), [])
})

test('a note on a step is drawn under its verb and edits in place', () => {
  const { screen } = open(PANCAKES)
  assert.ok(all(screen).some((node) => byClass('note')(node) && plain(node) === '2 min je Seite'))

  tap(one(screen, byClass('note'), 'note'))
  const form = fill({})
  assert.equal(field(form, 'Instruction').value, 'braten')
  assert.equal(field(form, 'Note').value, '2 min je Seite')
})

test('punctuation the file would read as structure is refused while it is typed', async () => {
  const { screen, saved } = open('# Neu\n')

  click(screen, '+ Ingredient')
  fill({ Name: 'Salz: grob', Amount: '1', Unit: 'TL' })
  submit()
  tick(screen, 'Salz: grob')
  process(screen)
  fill({ Instruction: 'würzen' })
  submit()

  // `- Salz: grob: 1 TL` splits at the first colon, so this card would come back as
  // salt in an amount of "grob" - and come back as the same text, so no round trip
  // would notice. It is caught for what it is: a colon inside a name.
  assert.deepEqual(faults(screen), ['A colon cannot be part of a name. Put it in the amount instead'])
  const save = one(screen, byText('Save'), 'Save')
  assert.equal(save.disabled, true)

  // The fault leads to the ingredient it is about, where it can be fixed.
  tap(one(screen, byClass('fault'), 'fault'))
  fill({ Name: 'Salz', Amount: 'grob', Unit: '' })
  submit()

  assert.deepEqual(faults(screen), [])
  await one(screen, byText('Save'), 'Save').onclick()
  assert.deepEqual(saved, ['# Neu\n\n- würzen\n  - Salz: grob\n'])
})

test('brackets in a name are refused too, and the note is offered instead', () => {
  const { screen } = open('# Neu\n')
  click(screen, '+ Ingredient')
  fill({ Name: 'Mehl (Type 550)' })
  submit()
  assert.ok(
    faults(screen).includes('Brackets cannot be part of a name. Put it in the note instead'),
  )
})

test('the card sheet writes the title, the yield and the preparations', () => {
  const { screen } = open('# Neu\n')

  click(screen, '+ Ingredient')
  fill({ Name: 'Teig' })
  submit()
  tick(screen, 'Teig')
  process(screen)
  fill({ Instruction: 'backen' })
  submit()

  click(screen, 'Card')
  fill({ Title: 'Brot', Makes: '1 Laib', Preparations: 'Ofen vorheizen (240 °C)' })
  submit()

  // A preparation for the whole card is the band across the top of the table itself.
  const band = one(onlyTable(screen), byClass('preparation'), 'preparation')
  assert.equal(plain(band), 'Ofen vorheizen240 °C')
  assert.deepEqual(faults(screen), [])
})

test('a card with no title cannot be saved, and the fault says which', () => {
  const { screen } = open('# x\n')
  click(screen, 'Card')
  fill({ Title: '  ' })
  submit()
  assert.ok(all(screen).some((node) => node.textContent.includes('The card needs a title')))
})

test('the sheet is taken off the page when it closes', () => {
  const { screen } = open('# Neu\n')
  click(screen, '+ Ingredient')
  assert.equal(descendants(body).filter((node) => node.tag === 'dialog').length, 1)
  sheet().close()
  assert.equal(descendants(body).filter((node) => node.tag === 'dialog').length, 0)
})

test('a save that arrives is said, and so is one that does not', async () => {
  const { screen, saved } = open(PANCAKES)
  const edit = () => {
    tap(one(screen, (node) => byClass('verb')(node) && node.textContent === 'braten', 'braten'))
    fill({ Instruction: 'anbraten' })
    submit()
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
  tap(one(screen, (node) => byClass('verb')(node) && node.textContent === 'braten', 'braten'))
  fill({ Instruction: 'anbraten' })
  submit()

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
  // The sheet says it again, next to what goes in, before it is committed.
  assert.ok(all(sheet()).some((node) => node.textContent.includes('comes out of verrühren')))
  fill({ Instruction: 'sieben' })
  submit()

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
  fill({ Instruction: 'bräunen' })
  submit()

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
  fill({ Instruction: 'mischen' })
  submit()
  assert.deepEqual(shown(screen).sort(), ['braten', 'mischen', 'schmelzen', 'verrühren'])
})

test('the header box takes the whole strand, and lets it go again', () => {
  const { screen } = open(WITH_BUTTER)
  const grid = all(screen).filter(byClass('grid')).at(-1)
  const header = all(grid).filter(byClass('choose'))[0]

  tap(header)
  assert.equal(takes(screen), 'braten')

  tap(all(all(screen).filter(byClass('grid')).at(-1)).filter(byClass('choose'))[0])
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
  fill({ Name: 'Mehl' })
  submit()
  assert.deepEqual(named(screen), ['Mehl'])
  // Still one table, and still exactly one of each way to add.
  assert.equal(all(onlyTable(screen)).filter(byText('+ Ingredient')).length, 1)
  assert.equal(all(onlyTable(screen)).filter(byText('+ Step')).length, 1)
})

test('a card is one table at every stage of being written', () => {
  const { screen } = open('# Neu\n')
  onlyTable(screen)

  for (const name of ['Reis', 'Hähnchen']) {
    tap(one(onlyTable(screen), byText('+ Ingredient'), 'add row'))
    fill({ Name: name })
    submit()
    onlyTable(screen)
  }

  // Two strands that have not met is the case that used to draw two tables.
  for (const [name, verb] of [['Reis', 'kochen'], ['Hähnchen', 'braten']]) {
    tick(screen, name)
    process(screen)
    fill({ Instruction: verb })
    submit()
    onlyTable(screen)
  }
  assert.deepEqual(faults(screen), [
    'kochen and braten never meet. Add a step that takes them all',
  ])
  assert.deepEqual(named(screen), ['Reis', 'Hähnchen'])
})

test('an existing step still edits its inputs as a list', () => {
  const { screen } = open(WITH_BUTTER)
  tap(one(screen, (node) => byClass('verb')(node) && node.textContent === 'braten', 'braten'))
  assert.deepEqual(choices().map((choice) => choice.text), ['verrühren', 'schmelzen'])
})

test('a step can be added before anything is ticked, and the table says so', () => {
  const { screen } = open(WITH_BUTTER)

  // The affordance is there at rest: nothing has been ticked, and nothing needs to be.
  const add = one(onlyTable(screen), byText('+ Step'), '+ Step')
  assert.equal(all(screen).filter(byClass('takes')).length, 0)

  tap(add)
  // With nothing ticked it asks with the list, so the button never does nothing.
  assert.deepEqual(choices().map((choice) => choice.text), ['braten'])
  sheet().close()

  // With rows ticked it takes them instead, and does not ask twice.
  tick(screen, 'Butter')
  tap(one(onlyTable(screen), byText('+ Step'), '+ Step'))
  assert.deepEqual(choices(), [])
  assert.ok(all(sheet()).some((node) => byClass('taken')(node) && node.textContent === 'schmelzen'))
})

test('an edit made while a save is in flight is not counted as saved', async () => {
  const { screen, saved, hold, let_go } = open(PANCAKES)
  const edit = (from, to) => {
    tap(one(screen, (node) => byClass('verb')(node) && node.textContent === from, from))
    fill({ Instruction: to })
    submit()
  }

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
  // The step column runs from the header to the same last row as the add row.
  assert.equal(step.row, 1)
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
