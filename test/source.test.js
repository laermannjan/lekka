import test from 'node:test'
import assert from 'node:assert/strict'

globalThis.document = { execCommand: () => false }

const { wrapInStep } = await import('../app/source.js')

function area(text, start, end = start) {
  return {
    value: text,
    selectionStart: start,
    selectionEnd: end,
    setSelectionRange(from, to) {
      this.selectionStart = from
      this.selectionEnd = to
    },
    focus() {},
  }
}

const CARD = [
  '- braten',
  '  - verrühren',
  '    - Mehl: 250 g',
  '  - schmelzen',
  '    - Butter: 30 g',
].join('\n')

test('a step is wrapped around the subtree under the cursor', () => {
  const field = area(CARD, CARD.indexOf('- verrühren'))
  wrapInStep(field)

  assert.deepEqual(field.value.split('\n'), [
    '- braten',
    '  - ',
    '    - verrühren',
    '      - Mehl: 250 g',
    '  - schmelzen',
    '    - Butter: 30 g',
  ])
  assert.equal(field.value.slice(0, field.selectionStart).split('\n').at(-1), '  - ')
})

test('a selection is wrapped whole, at the shallowest indent it holds', () => {
  const from = CARD.indexOf('  - verrühren')
  const field = area(CARD, from, CARD.indexOf('    - Butter') + 1)
  wrapInStep(field)

  assert.deepEqual(field.value.split('\n'), [
    '- braten',
    '  - ',
    '    - verrühren',
    '      - Mehl: 250 g',
    '    - schmelzen',
    '      - Butter: 30 g',
  ])
})

test('a leaf wraps alone', () => {
  const field = area(CARD, CARD.indexOf('    - Butter'))
  wrapInStep(field)

  assert.deepEqual(field.value.split('\n'), [
    '- braten',
    '  - verrühren',
    '    - Mehl: 250 g',
    '  - schmelzen',
    '    - ',
    '      - Butter: 30 g',
  ])
})
