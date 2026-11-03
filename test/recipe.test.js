import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parseCard } from '../app/card.js'
import { aboutOf, clock, servings, sourceName, stepsOf, totalTime } from '../app/recipe.js'
import { formatAmount } from '../app/amount.js'
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
  assert.equal(totalTime(stepsOf(PORCHETTA)), '15h15')
})

test('a range anywhere makes the total a range', () => {
  assert.equal(totalTime(stepsOf(card('barbecue-pork-ribs'))), '14h33-15h33')
  assert.equal(clock(45 * 60), '45 min')
  assert.equal(clock(7200), '2h')
  assert.equal(clock(3600 + 5 * 60), '1h05')
  assert.equal(clock(2 * 3600 - 10), '2h', 'a minute rounded up carries into the hour')
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

test('a step is read out as its sentence, its ingredients where the braces stand', async () => {
  const { phrase } = await import('../app/recipe.js')
  const card = parseCard(`# Brot

- verrühren (Flexi-Rührer)
  > den Sauerteig mit {Wasser 70 °C}, {Salz} und {Zucker} 2 min verrühren
  - reifen 12 h
    - Sauerteig: 300 g
  - Wasser 70 °C: 250 g
  - Salz: 8 g
  - Roggenmehl: 355 g
`)
  const [reifen, verruehren] = stepsOf(card)
  const read = (parts) => parts.map((part) => (part.kind === 'use' ? `[${part.node.name}]` : part.kind === 'text' ? part.text : `<${part.kind} ${part.text}>`)).join('')
  assert.equal(read(phrase(verruehren)), 'Den Sauerteig mit [Wasser 70 °C], [Salz] und Zucker <time 2 min> verrühren [Roggenmehl]',
    'a brace naming nothing is a plain word, an ingredient left unsaid comes last')
  assert.equal(read(phrase(reifen)), 'Reifen <time 12 h> [Sauerteig]', 'no sentence: its words, its time, its ingredients')

  const braten = stepsOf(parseCard('# P\n\n- backen 150 °C 3 h (nach 1 h begießen)\n  - Bauch: 2 kg\n'))[0]
  assert.equal(read(phrase(braten)), 'Backen <heat 150 °C> <time 3 h> [Bauch], nach <time 1 h> begießen')
})

test('the ingredients are gathered from the steps: one line a thing, its uses added up', async () => {
  const { gather } = await import('../app/recipe.js')
  const lines = gather(parseCard(`# Brot

- backen
  - verrühren
    - reifen
      - Mehl: 250 g
      - Salz: 5 g
      - Wasser (50 °C): 285 g
    - Mehl: 355 g
    - Salz: 1 EL
    - Wasser (70 °C): 250 g
    - Saaten: 40-60 g
  - Saaten: 10 g
  - Pfeffer: nach Geschmack
  - Pfeffer: nach Geschmack
`))
  const shown = lines.map((line) => `${line.name}${line.aside ? ` (${line.aside})` : ''}: ${line.amounts.map(formatAmount).join(' + ')} [${line.steps.join(', ')}]`)
  assert.deepEqual(shown, [
    'Mehl: 605 g [1, 2]',
    'Salz: 5 g + 1 EL [1, 2]',
    'Wasser (50 °C): 285 g [1]',
    'Wasser (70 °C): 250 g [2]',
    'Saaten: 50-70 g [2, 3]',
    'Pfeffer: nach Geschmack [3]',
  ])
  assert.equal(lines[0].nodes.length, 2)
})
