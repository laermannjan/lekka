import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openStore } from '../server/store.js'

const CARD = '# A\n\n- kochen\n  - Wasser: 1 l\n'

async function store() {
  return openStore(await mkdtemp(join(tmpdir(), 'lekka-'))).open()
}

test('a card round-trips through the directory', async () => {
  const cards = await store()
  const { id, key } = await cards.create(CARD)

  assert.equal(id.length, 10)
  assert.equal(key.length, 22)
  assert.equal((await cards.read(id)).text, CARD)
  assert.equal(await cards.read('nothingxyz'), null)

  assert.equal(await cards.write(id, '# B\n'), true)
  assert.equal((await cards.read(id)).text, '# B\n')
  assert.equal(await cards.write('nothingxyz', '# B\n'), false)
})

test('the card is stored as its own file, the envelope beside it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lekka-'))
  const cards = await openStore(directory).open()
  const { id } = await cards.create(CARD)

  assert.deepEqual((await readdir(directory)).sort(), [`${id}.json`, `${id}.lekka`])
  assert.equal(await readFile(join(directory, `${id}.lekka`), 'utf8'), CARD)
})

test('the key is never stored, only its hash', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lekka-'))
  const cards = await openStore(directory).open()
  const { id, key } = await cards.create(CARD)

  const envelope = await readFile(join(directory, `${id}.json`), 'utf8')
  assert.equal(envelope.includes(key), false)
  assert.match(JSON.parse(envelope).key, /^[0-9a-f]{64}$/)
})

test('only the right key opens a card', async () => {
  const cards = await store()
  const one = await cards.create(CARD)
  const other = await cards.create(CARD)

  assert.equal(await cards.verify(one.id, one.key), true)
  assert.equal(await cards.verify(one.id, other.key), false)
  assert.equal(await cards.verify(one.id, ''), false)
  assert.equal(await cards.verify(one.id, undefined), false)
  assert.equal(await cards.verify(one.id, `${one.key}x`), false)
  assert.equal(await cards.verify('nothingxyz', one.key), false)
})

test('removing takes both files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lekka-'))
  const cards = await openStore(directory).open()
  const { id } = await cards.create(CARD)

  await cards.remove(id)
  assert.deepEqual(await readdir(directory), [])
  assert.equal(await cards.read(id), null)
})

test('a sweep drops what nobody has touched', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lekka-'))
  const cards = await openStore(directory).open()
  const stale = await cards.create(CARD)
  const fresh = await cards.create(CARD)

  await age(directory, stale.id, 400)
  await cards.sweep(365)

  assert.equal(await cards.read(stale.id), null)
  assert.notEqual(await cards.read(fresh.id), null)
})

test('a read keeps a card alive, but writes the envelope at most daily', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lekka-'))
  const cards = await openStore(directory).open()
  const { id } = await cards.create(CARD)

  const before = await touched(directory, id)
  await cards.touch(id)
  assert.equal(await touched(directory, id), before)

  await age(directory, id, 2)
  await cards.touch(id)
  assert.notEqual(await touched(directory, id), before)
})

async function age(directory, id, days) {
  const path = join(directory, `${id}.json`)
  const meta = JSON.parse(await readFile(path, 'utf8'))
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  await writeFile(path, JSON.stringify({ ...meta, touched: when }))
}

async function touched(directory, id) {
  return JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8')).touched
}
