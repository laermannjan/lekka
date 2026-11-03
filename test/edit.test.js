import test from 'node:test'
import assert from 'node:assert/strict'

import { parseCard, formatCard } from '../app/card.js'
import {
  toDraft, fromDraft, stepsIn, sources, ingredientsOf, insertAfter, setStep, deleteStep,
  mergeable, merge, joined, split, moveIngredient, ingredientOf, rowOf, unbraced, named,
  braced, shortOf, validate, storedForm,
} from '../app/edit.js'

const ERDKRUSTE = `# Erdkruste (1 Laib)

- reifen 12 h
  - verrühren
    > {Roggenvollkornmehl} und {Salz} einrühren
    - aufschlämmen
      > {reifes Anstellgut} in {Wasser 50 °C} aufschlämmen
      - reifes Anstellgut: 50 g
      - Wasser 50 °C: 285 g
    - Roggenvollkornmehl: 250 g
    - Salz: 5 g
`

const draftOf = (text) => toDraft(parseCard(text))
const empty = () => draftOf('# Neu\n')
const kinds = (faults) => faults.map((fault) => fault.kind)
const verbs = (draft) => stepsIn(draft).map((step) => step.verb)
const text = (draft) => formatCard(fromDraft(draft))
const fieldsOf = (step) => ({
  sentence: unbraced(step.sentence),
  verb: step.verb,
  aside: step.aside ?? '',
  ingredients: ingredientsOf(step),
  from: step.children.filter((child) => child.kind === 'step'),
})

test('a card opens as one strand, its steps listed in the order they are done, and closes as the card it was', () => {
  const draft = draftOf(ERDKRUSTE)
  assert.equal(draft.strands.length, 1)
  assert.deepEqual(verbs(draft), ['aufschlämmen', 'verrühren', 'reifen 12 h'])
  for (const step of stepsIn(draft)) setStep(draft, step, fieldsOf(step))
  assert.equal(text(draft), ERDKRUSTE)
})

test('an empty card has no steps and is not saveable', () => {
  assert.deepEqual(stepsIn(empty()), [])
  assert.deepEqual(kinds(validate(empty())), ['empty'])
})

test('a recipe is written from scratch one step after the other, each carrying on from the last', () => {
  let { draft, node: first } = insertAfter(empty(), null, {
    sentence: 'Mehl und Milch verrühren',
    verb: 'verrühren',
    ingredients: [ingredientOf({ amount: '250 g', name: 'Mehl (Type 550)' }), ingredientOf({ amount: '500 ml', name: 'Milch' })],
  })
  ;({ draft } = insertAfter(draft, first, { sentence: 'in der Pfanne 2 min je Seite braten', verb: 'braten' }))
  assert.equal(
    text({ ...draft, title: 'Pfannkuchen' }),
    `# Pfannkuchen

- braten
  > in der Pfanne 2 min je Seite braten
  - verrühren
    > {Mehl} und {Milch} verrühren
    - Mehl (Type 550): 250 g
    - Milch: 500 ml
`,
  )
  assert.deepEqual(validate({ ...draft, title: 'Pfannkuchen' }), [])
})

test('a step put in between takes what the one above made, and gives it on to the one below', () => {
  let draft = draftOf(ERDKRUSTE)
  const [aufschlaemmen] = stepsIn(draft)
  ;({ draft } = insertAfter(draft, aufschlaemmen, { sentence: 'kurz quellen lassen', verb: 'quellen' }))
  assert.deepEqual(verbs(draft), ['aufschlämmen', 'quellen', 'verrühren', 'reifen 12 h'])
  assert.deepEqual(validate(draft), [])
})

test('a new step that takes nothing from before starts a strand of its own, until a step takes both', () => {
  let draft = draftOf(ERDKRUSTE)
  const reifen = stepsIn(draft).at(-1)
  let soaker
  ;({ draft, node: soaker } = insertAfter(draft, reifen, {
    sentence: 'die Saaten mit kochendem Wasser übergießen',
    verb: 'übergießen',
    ingredients: [ingredientOf({ amount: '100 g', name: 'Saaten' }), ingredientOf({ amount: '100 g', name: 'kochendes Wasser' })],
    from: [],
  }))
  assert.equal(draft.strands.length, 2)
  assert.deepEqual(kinds(validate(draft)), ['unjoined'])
  assert.deepEqual(sources(draft, null).map((step) => step.verb), ['reifen 12 h', 'übergießen'])

  ;({ draft } = insertAfter(draft, soaker, { sentence: 'alles verrühren', verb: 'verrühren', from: [reifen, soaker] }))
  assert.equal(draft.strands.length, 1)
  assert.deepEqual(verbs(draft), ['aufschlämmen', 'verrühren', 'reifen 12 h', 'übergießen', 'verrühren'])
  assert.deepEqual(validate(draft), [])
})

test('a step no longer taken is the end of a strand again', () => {
  let draft = draftOf(ERDKRUSTE)
  const [aufschlaemmen, verruehren] = stepsIn(draft)
  draft = setStep(draft, verruehren, { ...fieldsOf(verruehren), from: [] })
  assert.equal(draft.strands.length, 2)
  assert.ok(draft.strands.includes(aufschlaemmen))
  assert.ok(sources(draft, verruehren).includes(aufschlaemmen))
  assert.deepEqual(kinds(validate(draft)), ['unjoined'])
})

test('a step deleted takes its own ingredients, and what went into it goes into the step after it', () => {
  let draft = draftOf(ERDKRUSTE)
  const [, verruehren] = stepsIn(draft)
  draft = deleteStep(draft, verruehren)
  assert.deepEqual(verbs(draft), ['aufschlämmen', 'reifen 12 h'])
  assert.ok(!text(draft).includes('Roggenvollkornmehl'))
  assert.deepEqual(validate(draft), [])
})

test('the last step deleted leaves the one before it as the end', () => {
  let draft = draftOf(ERDKRUSTE)
  draft = deleteStep(draft, stepsIn(draft).at(-1))
  assert.deepEqual(verbs(draft), ['aufschlämmen', 'verrühren'])
  assert.equal(draft.strands.length, 1)
})

test('two steps merge when the first goes straight into the second: their words joined, their ingredients one list', () => {
  let draft = draftOf(ERDKRUSTE)
  const [aufschlaemmen, verruehren, reifen] = stepsIn(draft)
  assert.equal(mergeable(draft, aufschlaemmen), null)
  assert.equal(mergeable(draft, verruehren), aufschlaemmen)

  const said = joined(aufschlaemmen, verruehren)
  assert.equal(said.sentence, 'reifes Anstellgut in Wasser 50 °C aufschlämmen, then Roggenvollkornmehl und Salz einrühren')
  assert.equal(said.verb, 'aufschlämmen, verrühren')

  draft = merge(draft, verruehren, said)
  assert.deepEqual(verbs(draft), ['aufschlämmen, verrühren', 'reifen 12 h'])
  assert.deepEqual(ingredientsOf(verruehren).map((one) => one.name), ['reifes Anstellgut', 'Wasser 50 °C', 'Roggenvollkornmehl', 'Salz'])
  assert.equal(verruehren.sentence, '{reifes Anstellgut} in {Wasser 50 °C} aufschlämmen, then {Roggenvollkornmehl} und {Salz} einrühren')
  assert.ok(reifen.children.includes(verruehren))
  assert.deepEqual(validate(draft), [])
})

test('the same ingredient in both merged steps, in one unit, is one line of their sum', () => {
  let draft = draftOf('# B\n\n- kneten\n  - mischen\n    - Salz: 5 g\n    - Mehl: 300 g\n  - Salz: 3 g\n')
  const [mischen, kneten] = stepsIn(draft)
  draft = merge(draft, kneten, joined(mischen, kneten))
  assert.deepEqual(ingredientsOf(kneten).map(rowOf), [{ amount: '8 g', name: 'Salz' }, { amount: '300 g', name: 'Mehl' }])
})

test('a step split: what is ticked moves into a new step right after it, which carries on from it', () => {
  let draft = draftOf(ERDKRUSTE)
  const [, verruehren] = stepsIn(draft)
  const [mehl, salz] = ingredientsOf(verruehren)
  ;({ draft } = split(draft, verruehren, {
    keep: { sentence: 'Roggenvollkornmehl einrühren', verb: 'einrühren' },
    next: { sentence: 'Salz einstreuen und 2 min weiterrühren', verb: 'weiterrühren 2 min' },
    moving: [salz],
  }))
  assert.deepEqual(verbs(draft), ['aufschlämmen', 'einrühren', 'weiterrühren 2 min', 'reifen 12 h'])
  assert.deepEqual(ingredientsOf(verruehren), [mehl])
  assert.equal(stepsIn(draft)[2].sentence, '{Salz} einstreuen und 2 min weiterrühren')
  assert.deepEqual(validate(draft), [])
})

test('an ingredient moves from one step to another', () => {
  let draft = draftOf(ERDKRUSTE)
  const [aufschlaemmen, verruehren] = stepsIn(draft)
  const salz = ingredientsOf(verruehren).at(-1)
  draft = moveIngredient(draft, salz, aufschlaemmen)
  assert.ok(ingredientsOf(aufschlaemmen).includes(salz))
  assert.ok(!ingredientsOf(verruehren).includes(salz))
})

test('an ingredient is written in two fields, its sort in brackets, and read back the same', () => {
  const mehl = ingredientOf({ amount: '40-60 g', name: 'Mehl (Type 550)' })
  assert.deepEqual(mehl, { kind: 'ingredient', name: 'Mehl', aside: 'Type 550', amount: { kind: 'range', from: 40, to: 60, unit: 'g' } })
  assert.deepEqual(rowOf(mehl), { amount: '40-60 g', name: 'Mehl (Type 550)' })
  assert.equal(ingredientOf({ amount: '', name: 'Pfeffer' }).amount, null)
})

test('a sentence is typed without braces, and the names it says are braced as it is stored', () => {
  const ingredients = [ingredientOf({ name: 'Wasser 70 °C' }), ingredientOf({ name: 'Roggenvollkornmehl' }), ingredientOf({ name: 'Salz' }), ingredientOf({ name: 'Mehl' })]
  const typed = 'Den Sauerteig mit Wasser 70 °C, Roggenvollkornmehl und salz verrühren'
  assert.deepEqual(named(typed, ingredients).map((one) => one.name), ['Wasser 70 °C', 'Roggenvollkornmehl', 'Salz'])
  assert.equal(braced(typed, ingredients), 'Den Sauerteig mit {Wasser 70 °C}, {Roggenvollkornmehl} und {Salz} verrühren')
  assert.equal(unbraced('{Mehl} sieben'), 'Mehl sieben')
})

test('a short form is guessed from what a step says: its verb, its heat, its time', () => {
  // Outside a browser the screens speak English, where the verb comes first.
  assert.equal(shortOf('bake at 220 °C for 40 min'), 'bake 220 °C 40 min')
  assert.equal(shortOf('{Mehl} sieben'), 'mehl')
  assert.equal(shortOf(''), '')
})

test('a draft with more than one strand cannot be stored', () => {
  let draft = draftOf(ERDKRUSTE)
  assert.equal(typeof storedForm(draft), 'string')
  ;({ draft } = insertAfter(draft, stepsIn(draft).at(-1), { sentence: 'salzen', verb: 'salzen', ingredients: [ingredientOf({ name: 'Salz' })], from: [] }))
  assert.equal(storedForm(draft), null)
})

test('a card needs a title, a step a verb, an ingredient a name, and every step something going in', () => {
  const { draft } = insertAfter({ ...empty(), title: ' ' }, null, { sentence: '', verb: '', ingredients: [ingredientOf({ name: ' ' })] })
  assert.deepEqual(kinds(validate(draft)).sort(), ['name', 'title', 'verb'])
  const { draft: bare } = insertAfter(empty(), null, { sentence: 'backen', verb: 'backen' })
  assert.deepEqual(kinds(validate(bare)), ['starved'])
})
