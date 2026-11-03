import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

import { parseCard, formatCard, formatJson, ParseError } from '../app/card.js'
import { parseAmount, formatAmount, scaleAmount, showAmount } from '../app/amount.js'

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
  // Scaled by what somebody has, an amount is rounded the way it is measured.
  const by = 1.8 / 2.3
  assert.equal(formatAmount(scaleAmount(parseAmount('60 ml'), by)), '47 ml')
  assert.equal(showAmount(scaleAmount(parseAmount('1 EL'), by)), '¾ EL', 'a spoon to the fraction nearest')
  assert.equal(formatAmount(scaleAmount(parseAmount('3'), by)), '2,5')
  assert.equal(formatAmount(scaleAmount(parseAmount('1 Prise Salz'), 0.04)), '0,04 Prise Salz')
  assert.equal(formatAmount(scaleAmount(parseAmount('1'), 0.1)), '0,5')
  assert.equal(formatAmount(scaleAmount(parseAmount('2,5 kg'), 1)), '2,5 kg')
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

test('the example in the guide is the card it means, and uses only what the schema has', () => {
  const guide = readFileSync(new URL('../GUIDE.md', import.meta.url), 'utf8')
  const schema = JSON.parse(readFileSync(new URL('../recipe.schema.json', import.meta.url), 'utf8'))
  const example = JSON.parse(/```json\n([\s\S]*?)```/.exec(guide)[1])

  assert.equal(
    formatJson(example),
    `# Sandwich loaf (1 loaf)
> source: https://example.com/sandwich-loaf
> aliases: white bread, tin loaf, yeast bread
* grease a loaf tin

- bake 220 °C 40 min
  > bake at 220 °C for 40 min
  - put in tin
    > put the dough into the tin
    - rise 1 h (covered)
      > cover and leave to rise for 1 h, meanwhile heat the oven to 220 °C
      - knead 10 min
        > pour in {lukewarm water} and knead for 10 min
        - mix
          > mix {flour}, {salt} and {dry yeast}
          - flour (strong white, or plain): 500 g
          - salt: 10 g
          - dry yeast: 7 g
        - lukewarm water: 350 ml
`,
  )

  const known = (keys, entry) => Object.keys(entry).every((key) => keys.includes(key))
  const defs = schema.$defs
  const entry = (node) =>
    ['step', 'ingredient', 'preparation'].some(
      (kind) => kind in node && known(Object.keys(defs[kind].properties), node),
    ) && (node.children ?? []).every(entry)
  assert.ok(known(Object.keys(schema.properties), example))
  assert.ok(entry(example.root))
})

test('JSON is forgiven what an assistant gets wrong in form, not in substance', () => {
  const text = formatJson({
    title: 'Pfannkuchen\n',
    root: {
      step: 'verrühren',
      children: [
        { ingredient: 'Mehl', amount: 250, unit: 'g' },
        { ingredient: 'Milch', amount: '0,5 l', aside: 'kalt\noder warm' },
      ],
    },
  })
  assert.equal(text, '# Pfannkuchen\n\n- verrühren\n  - Mehl: 250 g\n  - Milch (kalt oder warm): 0,5 l\n')

  assert.throws(() => formatJson([]), ParseError)
  assert.throws(() => formatJson({ title: 'A' }), /root step/)
  assert.throws(() => formatJson({ title: 'A', root: { pour: 'x' } }), ParseError)

  // What the text would quietly read as something else.
  const bake = (children) => ({ title: 'A', root: { step: 'bake', children } })
  assert.throws(() => formatJson(bake([{ ingredient: 'flour (550)', amount: '1 kg' }])), /no brackets/)
  assert.throws(() => formatJson(bake([{ ingredient: 'flour', aside: 'type (550)' }])), /no brackets/)
  assert.throws(() => formatJson(bake([{ ingredient: 'flour: 550' }])), /no colon/)
  assert.throws(
    () => formatJson({ ...bake([{ ingredient: 'flour' }]), preparations: [{ ingredient: 'salt' }] }),
    /Only preparations/,
  )
  assert.throws(() => formatJson({ title: 'A', root: { step: 'nichts', children: [] } }), ParseError)

  // A preparation written as just its words, and a step that nothing goes into, are
  // preparations; only the last step must take something.
  assert.equal(
    formatJson({
      title: 'Brot',
      preparations: ['start the evening before'],
      root: { step: 'bake', children: [{ step: 'heat the oven', children: [] }, { ingredient: 'dough' }] },
    }),
    '# Brot\n* start the evening before\n\n- bake\n  * heat the oven\n  - dough\n',
  )
})

test('a step may say itself as a sentence, on a line right under it', () => {
  const text = `# Erdkruste

- verrühren (Flexi-Rührer)
  > den Sauerteig mit {Wasser 70 °C}, {Roggenvollkornmehl} und {Salz} verrühren
  - reifen 12 h
    - Sauerteig: 300 g
  - Wasser 70 °C: 250 g
  - Roggenvollkornmehl: 355 g
  - Salz: 8 g
`
  const card = parseCard(text)
  assert.equal(card.root.sentence, 'den Sauerteig mit {Wasser 70 °C}, {Roggenvollkornmehl} und {Salz} verrühren')
  assert.equal(card.root.children[0].sentence, undefined, 'a step without one has none')
  assert.equal(formatCard(card), text)

  const fails = (body, why) => assert.throws(() => parseCard(`# A\n\n${body}`), why)
  fails('- mischen\n  - Mehl: 1 kg\n  > Mehl mischen\n', /right under its step/)
  fails('- mischen\n  > Mehl mischen\n  > noch einmal\n  - Mehl: 1 kg\n', /right under its step/)
  fails('- mischen\n    > Mehl mischen\n  - Mehl: 1 kg\n', /right under its step/)
  fails('- mischen\n  - Mehl: 1 kg\n    > Mehl\n', /needs an ingredient/)
  fails('- mischen\n  >\n  - Mehl: 1 kg\n', /needs words/)
})

test("a brace in JSON around anything but its step's own ingredient is read as the word it holds", () => {
  const step = (sentence) => ({
    title: 'A',
    root: { step: 'mix', sentence, children: [{ ingredient: 'flour', amount: '1 kg' }, { ingredient: 'salt' }] },
  })
  assert.match(formatJson(step('mix {flour} and {salt}')), /\n {2}> mix \{flour\} and \{salt\}\n/)
  assert.match(formatJson(step('mix (gently) {flour}, the rest later')), /> mix \(gently\) \{flour\}/)
  assert.match(formatJson(step('mix {flour} into {the dough}')), /> mix \{flour\} into the dough\n/)
  assert.doesNotMatch(formatJson(step('  ')), />/)
})
