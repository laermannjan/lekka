import test from 'node:test'
import assert from 'node:assert/strict'

import { parseCard } from '../app/card.js'
import { duration, facts, mass, volume } from '../app/facts.js'

/**
 * What a recipe is, worked out from the recipe. None of it is stored on a card, so the
 * only way any of it can be wrong is arithmetic - which is what these check.
 */

const PANCAKES = `# Pfannkuchen

- braten 2 min je Seite
  - verrühren 10 min
    - Mehl: 250 g
    - Milch: 500 ml
`

test('the time, the weight and the liquid are read off the card', () => {
  const found = facts(parseCard(PANCAKES))
  assert.equal(found.minutes, 12)
  assert.equal(found.grams, 250)
  assert.equal(found.millilitres, 500)
  assert.equal(found.ingredients, 2)
  assert.equal(found.steps, 2)
})

test('a range is taken at its upper bound, so the total is the longest it can take', () => {
  const found = facts(parseCard('# x\n\n- backen 40-50 min\n  - Mehl: 1 kg\n'))
  assert.equal(found.minutes, 50)
  assert.equal(found.grams, 1000)
})

test('only a verb is counted, because a note holds asides and second opinions', () => {
  const found = facts(parseCard('# x\n\n- backen (gesamt 70 min, alle 20 min wenden)\n  - Mehl: 1 g\n'))
  assert.equal(found.minutes, 0)
})

test('an amount written as a fraction still counts', () => {
  const found = facts(parseCard('# x\n\n- rühren\n  - Wasser: ½ l\n  - Salz: 1 TL\n'))
  assert.equal(found.millilitres, 500)
  assert.equal(found.grams, 0)
})

test('an hour that is not quite whole is still an hour', () => {
  // Floored hours and a separately rounded remainder used to read "1 h 60 min".
  assert.equal(duration(119.6), '2 h')
  assert.equal(duration(59.7), '1 h')
  assert.equal(duration(119.4), '1 h 59 min')
  assert.equal(duration(75), '1 h 15 min')
  assert.equal(duration(45), '45 min')
  assert.equal(duration(0), null)
})

test('a weight is always grams, and a litre is only written when there is one', () => {
  assert.equal(mass(1203.4), '1203 g')
  assert.equal(mass(0), null)
  assert.equal(volume(750), '750 ml')
  assert.equal(volume(1500), '1.5 l')
  assert.equal(volume(0), null)
})
