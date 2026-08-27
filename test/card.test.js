import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

import { parseCard, formatCard, ParseError } from '../app/card.js'
import { parseAmount, formatAmount, scaleAmount } from '../app/amount.js'

const PANCAKES = `# Pfannkuchen (12 Stück)
> für Ida
* Pfanne vorheizen

- braten (2 min je Seite)
  - verrühren
    - Mehl (Type 550): 250 g
    - Milch: 0,5 l
    - Eier: 2
  - schmelzen
    - Butter: 30 g
`

test('the card head', () => {
  const card = parseCard(PANCAKES)
  assert.equal(card.title, 'Pfannkuchen')
  assert.equal(card.yields, '12 Stück')
  assert.deepEqual(card.notes, ['für Ida'])
  assert.deepEqual(card.preparations, [
    { kind: 'preparation', text: 'Pfanne vorheizen', aside: null },
  ])
})

test('children make a step, their absence an ingredient', () => {
  const { root } = parseCard(PANCAKES)
  assert.equal(root.kind, 'step')
  assert.equal(root.verb, 'braten')
  assert.equal(root.aside, '2 min je Seite')
  assert.deepEqual(
    root.children.map((child) => child.verb),
    ['verrühren', 'schmelzen'],
  )

  const flour = root.children[0].children[0]
  assert.deepEqual(flour, {
    kind: 'ingredient',
    name: 'Mehl',
    aside: 'Type 550',
    amount: { kind: 'number', value: 250, unit: 'g' },
  })
})

test('amounts', () => {
  assert.deepEqual(parseAmount('250 g'), { kind: 'number', value: 250, unit: 'g' })
  assert.deepEqual(parseAmount('2'), { kind: 'number', value: 2, unit: '' })
  assert.deepEqual(parseAmount('0,5 l'), { kind: 'number', value: 0.5, unit: 'l' })
  assert.deepEqual(parseAmount('2,5 kg'), { kind: 'number', value: 2.5, unit: 'kg' })
  assert.deepEqual(parseAmount('40-60 g'), { kind: 'range', from: 40, to: 60, unit: 'g' })
  assert.deepEqual(parseAmount('70-75 min'), { kind: 'range', from: 70, to: 75, unit: 'min' })
  assert.deepEqual(parseAmount('nach Geschmack'), { kind: 'words', text: 'nach Geschmack' })
  assert.equal(parseAmount('  '), null)
})

test('amounts are written as they can be read back', () => {
  for (const text of ['250 g', '2', '1,7 kg', '40-60 g', 'nach Geschmack'])
    assert.equal(formatAmount(parseAmount(text)), text)
})

test('scaling', () => {
  assert.equal(formatAmount(scaleAmount(parseAmount('2 l'), 3)), '6 l')
  assert.equal(formatAmount(scaleAmount(parseAmount('40-60 g'), 0.5)), '20-30 g')
  assert.equal(formatAmount(scaleAmount(parseAmount('Prise'), 2)), 'Prise')
})

test('errors carry the line', () => {
  const bad = (text) => assert.throws(() => parseCard(text), ParseError)
  bad('# A\n- x\n- y\n') // two outermost lines
  bad('# A\n# B\n')
  bad('# A\nMehl: 250 g\n')
  bad('# A\n- a\n      - b\n') // skips a level
  bad('- a\n') // no title

  try {
    parseCard('# A\n- a\n   - b\n')
  } catch (error) {
    assert.equal(error.line, 3)
  }
})

test('a preparation can hang under the step it precedes', () => {
  const card = parseCard(`# A

- backen
  * Ofen vorheizen (200 °C)
  - in Form geben
    - Teig: 1
`)
  assert.deepEqual(card.root.children[0], {
    kind: 'preparation',
    text: 'Ofen vorheizen',
    aside: '200 °C',
  })
  assert.equal(formatCard(card).includes('  * Ofen vorheizen (200 °C)'), true)
  assert.deepEqual(parseCard(formatCard(card)), card)
})

test('every line needs its own text', () => {
  assert.throws(() => parseCard('# A\n-\n  - c: 1\n'), ParseError)
  assert.throws(() => parseCard('# A\n- a\n  - : 1\n'), ParseError)
  assert.throws(() => parseCard('# A\n- a\n  *\n  - c: 1\n'), ParseError)
})

test('a preparation has no inputs, a step has an ingredient', () => {
  assert.throws(() => parseCard('# A\n- a\n  * b\n    - c: 1\n'), ParseError)
  assert.throws(() => parseCard('# A\n- a\n  * b\n'), ParseError)
})

test('writing round-trips', () => {
  const card = parseCard(PANCAKES)
  assert.equal(formatCard(card), PANCAKES)
  assert.deepEqual(parseCard(formatCard(card)), card)
})

test('the sample cards round-trip', () => {
  for (const name of readdirSync('test/cards')) {
    const text = readFileSync(`test/cards/${name}`, 'utf8')
    const card = parseCard(text)
    assert.deepEqual(parseCard(formatCard(card)), card, name)
    assert.equal(formatCard(parseCard(formatCard(card))), formatCard(card), name)
  }
})
