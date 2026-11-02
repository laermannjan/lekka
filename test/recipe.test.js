import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parseCard } from '../app/card.js'
import { aboutOf, clock, servings, sourceName, stepsOf, totalTime } from '../app/recipe.js'
import { fold, search } from '../app/search.js'

const card = (name) => parseCard(readFileSync(new URL(`./cards/${name}.lekka`, import.meta.url), 'utf8'))

const PORCHETTA = parseCard(`# Schweinebauch-Porchetta (10 Portionen)
> source: https://www.tasty.co/recipe/pork-belly-porchetta
> aliases: Porchetta, italienischer Schweinebraten, Rollbraten
> am Vortag beginnen

- backen 230 °C 15 min (für eine knusprige Kruste)
  - backen 150 °C 3 h (bis 70 °C Kerntemperatur)
    * Ofen auf 150 °C vorheizen
    - kühlen 12 h
      - würzen
        - schneiden
          - Schweinebauch (ohne Schwarte): 2,3 kg
        - Fenchelpollen: 60 ml
      - Salz (grob): 1 EL
`)

test('steps come in the order they are done, a preparation just before its step', () => {
  const steps = stepsOf(PORCHETTA)
  assert.deepEqual(
    steps.map((step) => [step.n, step.title]),
    [
      [1, 'Schneiden'],
      [2, 'Würzen'],
      [3, 'Kühlen'],
      [4, 'Ofen auf 150 °C vorheizen'],
      [5, 'Backen 150 °C'],
      [6, 'Backen 230 °C'],
    ],
  )
  assert.deepEqual(steps[1].ingredients.map((one) => one.name), ['Fenchelpollen'])
  assert.deepEqual(steps[2].ingredients.map((one) => one.name), ['Salz'])
  assert.equal(steps[3].kind, 'preparation')
})

test('a step knows its temperature and its time, and the time leaves the words', () => {
  const [, , chill, , slow, fast] = stepsOf(PORCHETTA)
  assert.deepEqual(chill.time, { text: '12 h', from: 43200, to: 43200 })
  assert.equal(slow.temperature, '150 °C')
  assert.equal(slow.aside, 'bis 70 °C Kerntemperatur')
  assert.equal(fast.time.from, 900)
  assert.equal(totalTime(stepsOf(PORCHETTA)), '15 h 15 min')
})

test('a range anywhere makes the total a range', () => {
  assert.equal(totalTime(stepsOf(card('barbecue-pork-ribs'))), '14 h 33 min to 15 h 33 min')
  assert.equal(clock(45 * 60), '45 min')
  assert.equal(clock(7200), '2 h')
})

test('the outermost preparations come first', () => {
  const steps = stepsOf(card('barbecue-pork-ribs'))
  assert.equal(steps[0].title, 'Buy charcoal the day before')
  assert.equal(steps.at(-1).title.startsWith('Glaze over medium heat'), true)
})

test('what a recipe yields is counted only when it starts with a number', () => {
  assert.deepEqual(servings('10 Portionen'), { count: 10, unit: 'Portionen' })
  assert.deepEqual(servings('1,5 kg'), { count: 1.5, unit: 'kg' })
  assert.equal(servings('ein Laib'), null)
  assert.equal(servings(null), null)
})

test('source and aliases are read out of the notes, the rest stay notes', () => {
  assert.deepEqual(aboutOf(PORCHETTA), {
    source: 'https://www.tasty.co/recipe/pork-belly-porchetta',
    aliases: ['Porchetta', 'italienischer Schweinebraten', 'Rollbraten'],
    notes: ['am Vortag beginnen'],
  })
  assert.equal(sourceName('https://www.tasty.co/recipe/x'), 'tasty.co')
  assert.equal(sourceName('Omas Kochbuch'), 'Omas Kochbuch')
})

test('search answers each recipe once, with its best reason', () => {
  const entries = [
    { id: 'p', card: PORCHETTA },
    { id: 'd', card: card('dinkelquarkbrot') },
    { id: 'r', card: card('roggenquarkbrot') },
    { id: 'broken', card: null },
  ]
  assert.deepEqual(search(entries, '  '), [])
  assert.deepEqual(
    search(entries, 'quark').map((hit) => [hit.id, hit.why]),
    [
      ['d', null],
      ['r', null],
    ],
  )
  assert.deepEqual(search(entries, 'rollbraten')[0].why, { label: 'Also known as', text: 'Rollbraten' })
  assert.deepEqual(search(entries, 'fenchel')[0].why, { label: 'Ingredient', text: 'Fenchelpollen, 60 ml' })
  assert.deepEqual(search(entries, 'kerntemp')[0].why, {
    label: 'Step 5',
    text: 'Backen 150 °C, bis 70 °C Kerntemperatur',
  })
  assert.equal(fold('Käsekuchen Straße'), 'kasekuchen strasse')
})

test('a time inside the words stays in them, and is still a time', () => {
  const [step] = stepsOf(parseCard('# P\n\n- braten 2 min je Seite\n  - Teig\n'))
  assert.equal(step.title, 'Braten 2 min je Seite')
  assert.equal(step.time.from, 120)
  assert.equal(step.timeShown, false)
})

test('a timer counts down in hours, minutes and seconds, and then says so', async () => {
  const { countdown } = await import('../app/cook.js')
  assert.equal(countdown(3 * 3600), '3:00:00')
  assert.equal(countdown(2 * 3600 + 41 * 60 + 7), '2:41:07')
  assert.equal(countdown(299.2), '05:00')
  assert.equal(countdown(0.4), '00:01')
  assert.equal(countdown(0), 'Done')
  assert.equal(countdown(-30), 'Done')
})

test('cooking, a heat that ends a step stands beside it, and one inside it stays', async () => {
  const { heatOf } = await import('../app/cook.js')
  const steps = stepsOf(parseCard('# P\n\n- backen 150 °C 3 h\n  - Ofen auf 150°C vorheizen\n    - Teig\n'))
  assert.deepEqual(heatOf(steps[0]), { title: 'Ofen auf 150°C vorheizen', heat: null })
  assert.deepEqual(heatOf(steps[1]), { title: 'Backen', heat: '150 °C' })
})
