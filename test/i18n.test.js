import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

import { GERMAN, t } from '../app/i18n.js'

test('every line the screens say has its German', () => {
  const said = new Set()
  for (const name of readdirSync(new URL('../app', import.meta.url)).filter((one) => one.endsWith('.js')))
    for (const [, key] of readFileSync(new URL(`../app/${name}`, import.meta.url), 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g))
      said.add(key.replace(/\\'/g, "'"))
  assert.ok(said.size > 100, `found ${said.size}`)
  assert.deepEqual([...said].filter((key) => !(key in GERMAN)), [])
})

test('outside a browser it speaks English, and fills in what it is given', () => {
  assert.equal(t('Step {n} of {count}', { n: 3, count: 11 }), 'Step 3 of 11')
  assert.equal(t('A line nobody translated'), 'A line nobody translated')
})
