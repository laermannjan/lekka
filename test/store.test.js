import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openStore } from '../server/store.js'

const CARD = '# A\n\n- kochen\n  - Wasser: 1 l\n'

async function directory() {
  return mkdtemp(join(tmpdir(), 'lekka-'))
}

async function store() {
  return openStore(await directory()).open()
}

test('a card round-trips through the directory', async () => {
  const { cards } = await store()
  const { id, key } = await cards.create(CARD, 'Dinkelquarkbrot')

  assert.match(id, /^dinkelquarkbrot-[a-z0-9]{10}$/)
  assert.equal(key.length, 22)
  assert.equal(await cards.read(id), CARD)
  assert.equal(await cards.read('nothingxyz'), null)

  assert.equal(await cards.write(id, '# B\n'), true)
  assert.equal(await cards.read(id), '# B\n')
  assert.equal(await cards.write('nothingxyz', '# B\n'), false)
})

test('a collection is the same shelf with a readable name', async () => {
  const { collections } = await store()
  const rows = JSON.stringify([{ id: '7kmqR2xvbn' }])
  const { id, key } = await collections.create(rows)

  assert.match(id, /^[a-z]+-[a-z]+-[a-z]+-[a-z0-9]{4}$/)
  assert.equal(key.length, 22)
  assert.equal(await collections.read(id), rows)
})

test('cards and collections live in their own directories', async () => {
  const where = await directory()
  const store = await openStore(where).open()
  const card = await store.cards.create(CARD, 'Dinkelquarkbrot')
  const collection = await store.collections.create('[]')

  assert.deepEqual((await readdir(where)).sort(), ['cards', 'collections'])
  assert.deepEqual(
    (await readdir(join(where, 'cards'))).sort(),
    [`${card.id}.lekka`, `${card.id}.meta.json`],
  )
  assert.equal(await readFile(join(where, 'cards', `${card.id}.lekka`), 'utf8'), CARD)
  assert.deepEqual(
    (await readdir(join(where, 'collections'))).sort(),
    [`${collection.id}.json`, `${collection.id}.meta.json`],
  )
})

test('a title becomes a file name, and nothing else can', async () => {
  const { cards } = await store()
  assert.match((await cards.create(CARD, 'Süßer Hefezopf (2 Stück)')).id, /^suesser-hefezopf-2-stueck-[a-z0-9]{10}$/)
  assert.match((await cards.create(CARD, '')).id, /^karte-[a-z0-9]{10}$/)
  assert.match((await cards.create(CARD, '../../etc/passwd')).id, /^etc-passwd-[a-z0-9]{10}$/)

  for (const id of ['../secret', 'a/b', 'A', '.', '', 'x'.repeat(65)])
    assert.equal(await cards.read(id), null, id)
})

test('a card is its file and the envelope beside it, both or neither', async () => {
  const where = await directory()
  const { cards } = await openStore(where).open()
  await writeFile(join(where, 'cards', 'erdkruste.lekka'), CARD)

  assert.equal(await cards.read('erdkruste'), null)
  assert.equal(await cards.verify('erdkruste', ''), false)
})

test('the key is never stored, only its hash', async () => {
  const where = await directory()
  const { cards } = await openStore(where).open()
  const { id, key } = await cards.create(CARD, 'A')

  const envelope = await readFile(join(where, 'cards', `${id}.meta.json`), 'utf8')
  assert.equal(envelope.includes(key), false)
  assert.match(JSON.parse(envelope).key, /^[0-9a-f]{64}$/)
})

test('only the right key opens a record', async () => {
  const { cards, collections } = await store()
  const one = await cards.create(CARD)
  const other = await cards.create(CARD)
  const collection = await collections.create('[]')

  assert.equal(await cards.verify(one.id, one.key), true)
  assert.equal(await cards.verify(one.id, other.key), false)
  assert.equal(await cards.verify(one.id, collection.key), false)
  assert.equal(await cards.verify(one.id, ''), false)
  assert.equal(await cards.verify(one.id, undefined), false)
  assert.equal(await cards.verify(one.id, `${one.key}x`), false)
  assert.equal(await cards.verify('nothingxyz', one.key), false)
  assert.equal(await cards.verify(collection.id, collection.key), false)
})

test('removing takes both files', async () => {
  const where = await directory()
  const { cards } = await openStore(where).open()
  const { id } = await cards.create(CARD)

  await cards.remove(id)
  assert.deepEqual(await readdir(join(where, 'cards')), [])
  assert.equal(await cards.read(id), null)
})

test('a sweep drops what nobody has touched', async () => {
  const where = await directory()
  const { cards } = await openStore(where).open()
  const stale = await cards.create(CARD)
  const fresh = await cards.create(CARD)

  await age(where, stale.id, 400)
  await cards.sweep(365)

  assert.equal(await cards.read(stale.id), null)
  assert.notEqual(await cards.read(fresh.id), null)
})

test('a sweep reaps what an interrupted write left behind', async () => {
  const where = await directory()
  const { cards } = await openStore(where).open()
  const { id } = await cards.create(CARD)

  const orphan = join(where, 'cards', 'orphan-cccccccccc.lekka')
  const temporary = join(where, 'cards', `${id}.lekka.abc123`)
  const young = join(where, 'cards', 'young-dddddddddd.lekka')
  for (const path of [orphan, temporary, young]) await writeFile(path, CARD)
  const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
  for (const path of [orphan, temporary]) await utimes(path, old, old)

  await cards.sweep(365)

  const left = await readdir(join(where, 'cards'))
  assert.deepEqual(left.sort(), [`${id}.lekka`, `${id}.meta.json`, 'young-dddddddddd.lekka'].sort())
})

test('a read keeps a record alive, but writes the envelope at most daily', async () => {
  const where = await directory()
  const { cards } = await openStore(where).open()
  const { id } = await cards.create(CARD)

  const before = await touched(where, id)
  await cards.touch(id)
  assert.equal(await touched(where, id), before)

  await age(where, id, 2)
  const stale = await touched(where, id)
  await cards.touch(id)
  assert.notEqual(await touched(where, id), stale)
})

function envelopePath(where, id) {
  return join(where, 'cards', `${id}.meta.json`)
}

async function age(where, id, days) {
  const meta = JSON.parse(await readFile(envelopePath(where, id), 'utf8'))
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  await writeFile(envelopePath(where, id), JSON.stringify({ ...meta, touched: when }))
}

async function touched(where, id) {
  return JSON.parse(await readFile(envelopePath(where, id), 'utf8')).touched
}
