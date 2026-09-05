import test from 'node:test'
import assert from 'node:assert/strict'

import { parseCard, formatCard } from '../app/card.js'
import {
  toDraft, fromDraft, candidates, inputs, holds, parentOf, beneath,
  addIngredient, addStep, editIngredient, editStep, removeNode, claim, upheaval,
  fieldsOf, preparationLines, validate, label, storedForm, sweptBy,
} from '../app/edit.js'

const PANCAKES = `# Pfannkuchen (12 Stück)

- braten (2 min je Seite)
  - verrühren
    - Mehl: 250 g
    - Milch: 500 ml
  - schmelzen
    - Butter: 30 g
`

const draftOf = (text) => toDraft(parseCard(text))
const empty = () => draftOf('# Neu\n')
const kinds = (faults) => faults.map((fault) => fault.kind)

test('a card opens as one strand and closes as the same card', () => {
  const draft = draftOf(PANCAKES)
  assert.equal(draft.strands.length, 1)
  assert.equal(draft.title, 'Pfannkuchen')
  assert.equal(draft.yields, '12 Stück')
  assert.equal(formatCard(fromDraft(draft)), PANCAKES)
})

test('an empty card has no strands and is not saveable', () => {
  assert.deepEqual(empty().strands, [])
  assert.deepEqual(kinds(validate(empty())), ['empty'])
})

test('a new ingredient waits as a strand of its own', () => {
  const draft = addIngredient(empty(), { name: 'Mehl', amount: '250', unit: 'g' })
  assert.equal(draft.strands.length, 1)
  assert.deepEqual(draft.strands[0], {
    kind: 'ingredient', name: 'Mehl', aside: null,
    amount: { kind: 'number', value: 250, unit: 'g' },
  })
})

test('an amount may be a range, a count, or words', () => {
  const of = (amount, unit) =>
    addIngredient(empty(), { name: 'X', amount, unit }).strands[0].amount
  assert.deepEqual(of('40-60', 'g'), { kind: 'range', from: 40, to: 60, unit: 'g' })
  assert.deepEqual(of('2', ''), { kind: 'number', value: 2, unit: '' })
  assert.deepEqual(of('nach Geschmack', ''), { kind: 'words', text: 'nach Geschmack' })
  assert.equal(of('', ''), null)
})

test('a note on an ingredient is its aside, and an empty one is no aside', () => {
  const of = (aside) => addIngredient(empty(), { name: 'Mehl', aside }).strands[0].aside
  assert.equal(of('Type 550'), 'Type 550')
  assert.equal(of('   '), null)
  assert.equal(of(undefined), null)
})

/* The filter the editor needs: everything already used has a parent, so it is not a root. */

test('the candidates are the strands, and taking one hides it', () => {
  let draft = addIngredient(addIngredient(empty(), { name: 'Mehl' }), { name: 'Milch' })
  const [mehl, milch] = draft.strands
  assert.deepEqual(candidates(draft), [mehl, milch])

  draft = addStep(draft, { verb: 'verrühren', inputs: [mehl, milch] })
  assert.deepEqual(candidates(draft), draft.strands)
  assert.equal(candidates(draft).length, 1)
  assert.equal(candidates(draft)[0].verb, 'verrühren')
})

test('a step takes the place of the earliest input it swallowed', () => {
  let draft = empty()
  for (const name of ['A', 'B', 'C', 'D']) draft = addIngredient(draft, { name })
  const [a, b, c, d] = draft.strands

  draft = addStep(draft, { verb: 'mischen', inputs: [b, d] })
  assert.deepEqual(draft.strands.map(label), ['A', 'mischen', 'C'])
  assert.deepEqual(inputs(draft.strands[1]), [b, d])
  assert.deepEqual([a, c], [draft.strands[0], draft.strands[2]])
})

test('editing a step offers its own inputs back, and nothing it is inside', () => {
  const draft = draftOf(PANCAKES)
  const braten = draft.strands[0]
  const [verruehren, schmelzen] = inputs(braten)

  // Its own inputs are invisible as strands; only editing puts them back on the list.
  assert.deepEqual(candidates(draft, braten), [verruehren, schmelzen])
  // A step inside braten may never be fed braten: that would be a loop.
  assert.deepEqual(candidates(draft, verruehren), inputs(verruehren))
  assert.equal(holds(braten, verruehren), true)
  assert.equal(holds(verruehren, braten), false)
})

test('dropping an input makes it a strand again, and adding one takes it away', () => {
  let draft = draftOf(PANCAKES)
  const braten = draft.strands[0]
  const [verruehren, schmelzen] = inputs(braten)

  draft = editStep(draft, braten, { verb: 'braten', inputs: [verruehren] })
  assert.deepEqual(draft.strands, [braten, schmelzen])
  assert.deepEqual(inputs(braten), [verruehren])
  assert.deepEqual(kinds(validate(draft)), ['unjoined'])

  draft = editStep(draft, braten, { verb: 'braten', inputs: [verruehren, schmelzen] })
  assert.deepEqual(draft.strands, [braten])
  assert.deepEqual(validate(draft), [])
})

test('deleting a step frees what it held instead of taking the strand with it', () => {
  let draft = draftOf(PANCAKES)
  const braten = draft.strands[0]
  const kept = inputs(braten)

  draft = removeNode(draft, braten)
  assert.deepEqual(draft.strands, kept)
  assert.deepEqual(kinds(validate(draft)), ['unjoined'])
})

test('deleting the last ingredient of a step takes the empty step with it', () => {
  let draft = draftOf(PANCAKES)
  const braten = draft.strands[0]
  const [verruehren, schmelzen] = inputs(braten)
  const butter = inputs(schmelzen)[0]
  assert.equal(parentOf(draft, butter), schmelzen)

  // A step with nothing going into it is not a shape the format has (rule 5), so it
  // does not linger as a fault: it goes when the last thing in it goes.
  draft = removeNode(draft, butter)
  assert.deepEqual(inputs(braten), [verruehren])
  assert.deepEqual(validate(draft), [])
})

test('emptying cascades only as far as it must', () => {
  let draft = draftOf('# A\n\n- backen\n  - ruhen\n    - kneten\n      - Mehl: 500 g\n')
  draft = removeNode(draft, beneath(draft.strands[0])[0])
  // kneten, then ruhen, then backen are each left with nothing, so all three go.
  assert.deepEqual(draft.strands, [])
  assert.deepEqual(kinds(validate(draft)), ['empty'])
})

/* Choosing rows. A row is an ingredient; what it stands for is whatever holds it. */

test('choosing every row of a strand means the strand', () => {
  const draft = draftOf(PANCAKES)
  const braten = draft.strands[0]
  assert.deepEqual(claim(draft, beneath(braten)), [braten])
})

test('choosing every row under one step means that step, not the rows', () => {
  const draft = draftOf(PANCAKES)
  const [verruehren, schmelzen] = inputs(draft.strands[0])
  assert.deepEqual(claim(draft, beneath(verruehren)), [verruehren])
  assert.deepEqual(claim(draft, beneath(schmelzen)), [schmelzen])
  // Both together are the whole strand again, so the answer climbs to its root.
  assert.deepEqual(claim(draft, [...beneath(verruehren), ...beneath(schmelzen)]), [draft.strands[0]])
})

test('choosing some of a step means those ingredients, which must come out of it', () => {
  const draft = draftOf(PANCAKES)
  const verruehren = inputs(draft.strands[0])[0]
  const [mehl] = inputs(verruehren)

  const taken = claim(draft, [mehl])
  assert.deepEqual(taken, [mehl])

  const { moved, emptied } = upheaval(draft, taken)
  assert.deepEqual(moved, [{ node: mehl, from: verruehren }])
  // verrühren keeps Milch, so it is not left empty.
  assert.deepEqual(emptied, [])
})

test('taking the last input of a step names the step as one that would be emptied', () => {
  const draft = draftOf(PANCAKES)
  const schmelzen = inputs(draft.strands[0])[1]
  const butter = inputs(schmelzen)[0]

  // Butter is the only thing in schmelzen, so choosing its row alone reads as schmelzen.
  assert.deepEqual(claim(draft, [butter]), [schmelzen])
  assert.deepEqual(upheaval(draft, [schmelzen]).emptied, [])

  // Naming the ingredient itself is what would empty it.
  const { moved, emptied } = upheaval(draft, [butter])
  assert.deepEqual(moved, [{ node: butter, from: schmelzen }])
  assert.deepEqual(emptied, [schmelzen])
})

test('rows chosen across two strands mean both roots, which is how strands join', () => {
  let draft = addIngredient(empty(), { name: 'Reis' })
  draft = addStep(draft, { verb: 'kochen', inputs: [draft.strands[0]] })
  draft = addIngredient(draft, { name: 'Hähnchen' })
  draft = addStep(draft, { verb: 'braten', inputs: [draft.strands[1]] })
  const [kochen, braten] = draft.strands

  const taken = claim(draft, draft.strands.flatMap(beneath))
  assert.deepEqual(taken, [kochen, braten])
  assert.deepEqual(upheaval(draft, taken), { moved: [], emptied: [] })

  draft = addStep(draft, { verb: 'anrichten', inputs: taken })
  assert.deepEqual(validate(draft), [])
})

test('a step built from rows pulled out of another leaves that one behind, minus them', () => {
  let draft = draftOf(PANCAKES)
  const braten = draft.strands[0]
  const verruehren = inputs(braten)[0]
  const [mehl, milch] = inputs(verruehren)

  draft = addStep(draft, { verb: 'sieben', inputs: claim(draft, [mehl]) })
  assert.deepEqual(inputs(verruehren), [milch])
  assert.deepEqual(draft.strands.map(label), ['braten', 'sieben'])
  assert.deepEqual(kinds(validate(draft)), ['unjoined'])
})

test('pulling out the last input takes the emptied step with it', () => {
  let draft = draftOf(PANCAKES)
  const braten = draft.strands[0]
  const schmelzen = inputs(braten)[1]
  const butter = inputs(schmelzen)[0]

  draft = addStep(draft, { verb: 'bräunen', inputs: [butter] })
  assert.deepEqual(inputs(braten).map(label), ['verrühren'])
  assert.equal(draft.strands.includes(schmelzen), false)
  assert.deepEqual(draft.strands.map(label), ['braten', 'bräunen'])
})

test('choosing nothing claims nothing', () => {
  assert.deepEqual(claim(draftOf(PANCAKES), []), [])
})

/* Validation: the parser's own rules, said about a node instead of a line number. */

test('an ingredient nobody uses is named as unused', () => {
  const draft = addIngredient(draftOf(PANCAKES), { name: 'Zucker', amount: '2', unit: 'EL' })
  const faults = validate(draft)
  assert.deepEqual(kinds(faults), ['unused'])
  assert.match(faults[0].message, /2 EL Zucker/)
  assert.equal(faults[0].node, draft.strands.at(-1))
})

test('two strands that never meet are one fault naming both', () => {
  let draft = addIngredient(empty(), { name: 'Reis' })
  draft = addStep(draft, { verb: 'kochen', inputs: [draft.strands[0]] })
  draft = addIngredient(draft, { name: 'Hähnchen' })
  draft = addStep(draft, { verb: 'braten', inputs: [draft.strands[1]] })

  const faults = validate(draft)
  assert.deepEqual(kinds(faults), ['unjoined'])
  assert.match(faults[0].message, /kochen and braten never meet/)

  draft = addStep(draft, { verb: 'anrichten', inputs: [...draft.strands] })
  assert.deepEqual(validate(draft), [])
  assert.equal(draft.strands.length, 1)
})

test('a card needs a title, a step a verb, an ingredient a name', () => {
  let draft = addIngredient({ ...empty(), title: ' ' }, { name: '  ' })
  draft = addStep(draft, { verb: '', inputs: [draft.strands[0]] })
  assert.deepEqual(kinds(validate(draft)).sort(), ['name', 'title', 'verb'])
})

test('a step fed only preparations is starved, as the parser would say', () => {
  const draft = addStep(empty(), { verb: 'backen', preparations: ['Ofen vorheizen'] })
  assert.deepEqual(kinds(validate(draft)), ['starved'])
  assert.deepEqual(preparationLines(draft.strands[0]), ['Ofen vorheizen'])
})

test('a preparation keeps its bracket as an aside', () => {
  const draft = addStep(empty(), { verb: 'backen', preparations: ['Ofen vorheizen (200 °C)'] })
  const prep = draft.strands[0].children[0]
  assert.deepEqual(prep, { kind: 'preparation', text: 'Ofen vorheizen', aside: '200 °C' })
  assert.deepEqual(preparationLines(draft.strands[0]), ['Ofen vorheizen (200 °C)'])
})

/* The round trip: what the form shows is what the node holds. */

test('a node fills a form, and the form written back leaves it unchanged', () => {
  const draft = draftOf('# A\n\n- braten (kurz)\n  - Mehl (Type 550): 40-60 g\n')
  const braten = draft.strands[0]
  const mehl = inputs(braten)[0]

  assert.deepEqual(fieldsOf(mehl), { name: 'Mehl', aside: 'Type 550', amount: '40-60', unit: 'g' })
  assert.deepEqual(fieldsOf(braten), {
    verb: 'braten', aside: 'kurz', preparations: [], inputs: [mehl],
  })

  editIngredient(draft, mehl, fieldsOf(mehl))
  editStep(draft, braten, fieldsOf(braten))
  assert.equal(formatCard(fromDraft(draft)), '# A\n\n- braten (kurz)\n  - Mehl (Type 550): 40-60 g\n')
})

test('an amount typed back in keeps its unit apart from its number', () => {
  const draft = addIngredient(empty(), { name: 'Milch', amount: '0,5', unit: 'l' })
  const milch = draft.strands[0]
  editIngredient(draft, milch, { ...fieldsOf(milch), amount: '1' })
  assert.deepEqual(milch.amount, { kind: 'number', value: 1, unit: 'l' })
})

/* What a move sweeps away that nobody pointed at. */

const NESTED = `# A

- anrichten (heiß)
  * Teller wärmen
  - verrühren
    - Mehl: 250 g
`

test('emptying climbs all the way, and is said all the way', () => {
  const draft = draftOf(NESTED)
  const anrichten = draft.strands[0]
  const verruehren = inputs(anrichten)[0]
  const mehl = inputs(verruehren)[0]

  // Mehl is all verrühren holds, and verrühren is all anrichten holds, so deleting one
  // ingredient takes the whole card body with it - including `(heiß)` and the preparation.
  assert.deepEqual(sweptBy(draft, mehl).map(label), ['verrühren', 'anrichten'])
  assert.deepEqual(upheaval(draft, [mehl]).emptied.map(label), ['verrühren', 'anrichten'])

  assert.deepEqual(removeNode(draft, mehl).strands, [])
})

test('nothing is swept when the step keeps something', () => {
  const draft = draftOf(PANCAKES)
  const verruehren = inputs(draft.strands[0])[0]
  assert.deepEqual(sweptBy(draft, inputs(verruehren)[0]), [])
})

test('a draft with more than one strand cannot be stored', () => {
  // `fromDraft` keeps one root, so a comparison against it would be against the
  // truncation itself and would always pass.
  let draft = addIngredient(empty(), { name: 'Reis' })
  draft = addStep(draft, { verb: 'kochen', inputs: [draft.strands[0]] })
  assert.equal(typeof storedForm(draft), 'string')

  draft = addIngredient(draft, { name: 'Salz' })
  draft = addStep(draft, { verb: 'würzen', inputs: [draft.strands[1]] })
  assert.equal(draft.strands.length, 2)
  assert.equal(storedForm(draft), null)
})

