import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { encode, svg, TooLong } from '../app/qr.js'

const print = (modules) => modules.map((row) => row.map((dark) => (dark ? '1' : '0')).join(''))
const digest = (modules) =>
  createHash('sha256').update(print(modules).join('\n')).digest('hex').slice(0, 32)

/**
 * A code is right or it is unreadable, and nothing in between tells you which. These four
 * were read back by a scanner (zxing) when they were written down; the hash keeps them so.
 */
const KNOWN = [
  ['hi', 21, '81240590f3a630b03aa70a8aaf521ec3'],
  ['https://lekka.example/c/abcde12345/zyxwv98765', 33, 'e73d4091027c231b9bc41209d290d51e'],
  ['ü'.repeat(50), 41, '40e6b228e758f0136891bfba4ef01e69'],
  ['x'.repeat(180), 53, '21e02ceea8d235cf29ba53f809c61e9b'],
]

for (const [text, size, hash] of KNOWN) {
  test(`the code for ${text.slice(0, 24)} is the one a scanner read`, () => {
    const modules = encode(text)
    assert.equal(modules.length, size)
    assert.equal(digest(modules), hash)
  })
}

test('the version grows with the link, and stops at ten', () => {
  assert.equal(encode('x'.repeat(14)).length, 21)
  assert.equal(encode('x'.repeat(15)).length, 25)
  assert.equal(encode('x'.repeat(213)).length, 57)
  assert.throws(() => encode('x'.repeat(214)), TooLong)
})

test('every code carries its finders and its timing line', () => {
  for (const text of ['hi', 'x'.repeat(100)]) {
    const modules = encode(text)
    const size = modules.length
    for (const [row, column] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      assert.equal(modules[row + 3][column + 3], true)
      assert.equal(modules[row + 1][column + 1], false)
    }
    for (let i = 8; i < size - 8; i++) {
      assert.equal(modules[6][i], i % 2 === 0)
      assert.equal(modules[i][6], i % 2 === 0)
    }
    assert.equal(modules[size - 8][8], true)
  }
})

test('the drawing holds a quiet zone and nothing that runs', () => {
  const drawing = svg('hi')
  assert.match(drawing, /^<svg [^>]*viewBox="0 0 29 29"/)
  // Markup in the text is encoded, never carried into the drawing.
  assert.doesNotMatch(svg('<script>alert(1)</script>'), /script|href/i)
})
