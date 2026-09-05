import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openDb } from '../server/db.js'
import { openStore, tag } from '../server/store.js'

const CARD = '# A\n\n- kochen\n  - Wasser: 1 l\n'

async function directory() {
  return mkdtemp(join(tmpdir(), 'lekka-'))
}

/** The store, and the handle underneath it, since some tests ask the rows directly. */
async function open(where) {
  const db = openDb(join(where, 'lekka.db'))
  return { db, store: await openStore(where, db).open() }
}

async function store() {
  return (await open(await directory())).store
}

test('a card round-trips through its file', async () => {
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

test('a collection is the same shelf with its body in the database', async () => {
  const { collections } = await store()
  const rows = JSON.stringify([{ id: '7kmqR2xvbn' }])
  const { id, key } = await collections.create(rows)

  assert.match(id, /^[a-z]+-[a-z]+-[a-z]+-[a-z0-9]{4}$/)
  assert.equal(key.length, 22)
  assert.equal(await collections.read(id), rows)
})

test('only the recipes are files; everything else is a row', async () => {
  const where = await directory()
  const { db, store } = await open(where)
  const card = await store.cards.create(CARD, 'Dinkelquarkbrot')
  const collection = await store.collections.create('[]')

  assert.deepEqual((await readdir(where)).filter((name) => !name.startsWith('lekka.db')).sort(), [
    'cards',
  ])
  assert.deepEqual(await readdir(join(where, 'cards')), [`${card.id}.lekka`])
  assert.equal(await readFile(join(where, 'cards', `${card.id}.lekka`), 'utf8'), CARD)

  const rows = db.prepare('select kind, id, body from records order by kind').all()
  assert.deepEqual(
    rows.map((row) => [row.kind, row.id, row.body]),
    [
      ['card', card.id, null],
      ['collection', collection.id, '[]'],
    ],
    'a card keeps its body on disk, a collection keeps its own in the column',
  )
})

test('a title becomes a file name, and nothing else can', async () => {
  const { cards } = await store()
  assert.match(
    (await cards.create(CARD, 'Süßer Hefezopf (2 Stück)')).id,
    /^suesser-hefezopf-2-stueck-[a-z0-9]{10}$/,
  )
  assert.match((await cards.create(CARD, '')).id, /^karte-[a-z0-9]{10}$/)
  assert.match((await cards.create(CARD, '../../etc/passwd')).id, /^etc-passwd-[a-z0-9]{10}$/)

  for (const id of ['../secret', 'a/b', 'A', '.', '', 'x'.repeat(65)])
    assert.equal(await cards.read(id), null, id)
})

test('a card is its row and its file, both or neither', async () => {
  const where = await directory()
  const { store } = await open(where)
  await writeFile(join(where, 'cards', 'erdkruste.lekka'), CARD)

  assert.equal(await store.cards.read('erdkruste'), null, 'a file nothing points at is not a card')
  assert.equal(await store.cards.verify('erdkruste', ''), false)
})

test('the key is never stored, only its hash', async () => {
  const where = await directory()
  const { db, store } = await open(where)
  const { id, key } = await store.cards.create(CARD, 'A')

  const row = db.prepare("select hash from records where kind = 'card' and id = ?").get(id)
  assert.notEqual(row.hash, key)
  assert.match(row.hash, /^[0-9a-f]{64}$/)

  const file = await readFile(join(where, 'cards', `${id}.lekka`), 'utf8')
  assert.equal(file.includes(key), false)
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

test('removing takes the file and the row', async () => {
  const where = await directory()
  const { db, store } = await open(where)
  const { id } = await store.cards.create(CARD)

  await store.cards.remove(id)
  assert.deepEqual(await readdir(join(where, 'cards')), [])
  assert.equal(await store.cards.read(id), null)
  assert.equal(db.prepare('select count(*) as n from records').get().n, 0)
})

test('a sweep drops what nobody has touched', async () => {
  const where = await directory()
  const { db, store } = await open(where)
  const stale = await store.cards.create(CARD)
  const fresh = await store.cards.create(CARD)

  age(db, stale.id, 400)
  await store.cards.sweep(365)

  assert.equal(await store.cards.read(stale.id), null)
  assert.notEqual(await store.cards.read(fresh.id), null)
})

test('a sweep reaps what an interrupted write left behind', async () => {
  const where = await directory()
  const { store } = await open(where)
  const { id } = await store.cards.create(CARD)

  const orphan = join(where, 'cards', 'orphan-cccccccccc.lekka')
  const temporary = join(where, 'cards', `${id}.lekka.abc123`)
  const young = join(where, 'cards', 'young-dddddddddd.lekka')
  for (const path of [orphan, temporary, young]) await writeFile(path, CARD)
  const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
  for (const path of [orphan, temporary]) await utimes(path, old, old)

  await store.cards.sweep(365)

  assert.deepEqual(
    (await readdir(join(where, 'cards'))).sort(),
    [`${id}.lekka`, 'young-dddddddddd.lekka'].sort(),
  )
})

test('a read keeps a record alive, but writes at most daily', async () => {
  const where = await directory()
  const { db, store } = await open(where)
  const { id } = await store.cards.create(CARD)

  const before = touched(db, id)
  await store.cards.touch(id)
  assert.equal(touched(db, id), before)

  age(db, id, 2)
  const stale = touched(db, id)
  await store.cards.touch(id)
  assert.notEqual(touched(db, id), stale)
})

test('a shelf answers what one person owns, and nothing of anybody else’s', async () => {
  const { cards } = await store()
  const mine = await cards.create(CARD, 'Mine', 'person-one')
  await cards.create(CARD, 'Theirs', 'person-two')
  await cards.create(CARD, 'Nobody’s')

  assert.deepEqual((await cards.mine('person-one')).map((row) => row.id), [mine.id])
  assert.deepEqual(await cards.mine('person-three'), [])
  assert.deepEqual(await cards.mine(null), [])
  assert.equal(await cards.owner(mine.id), 'person-one')
})

test('a body is swapped only if it still says what the writer thought', async () => {
  const { collections } = await store()
  const { id } = await collections.create('[]')

  assert.equal(collections.swap(id, '[1]', tag('nonsense')), 'changed')
  assert.equal(await collections.read(id), '[]', 'and the refused write changed nothing')

  assert.equal(collections.swap(id, '[1]', tag('[]')), 'written')
  assert.equal(await collections.read(id), '[1]')
  assert.equal(collections.swap(id, '[2]', '*'), 'written', 'a star writes over whatever is there')
  assert.equal(collections.swap('nothingxyz', '[]', '*'), 'gone')
})

test('an older data directory is adopted once, and its recipes are left alone', async () => {
  const where = await directory()

  // A directory as the previous version wrote it: bodies, and envelopes beside them.
  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(where, 'cards'), { recursive: true })
  await mkdir(join(where, 'collections'), { recursive: true })
  const when = '2026-01-01T00:00:00.000Z'
  await writeFile(join(where, 'cards', 'erdkruste-aaaaaaaaaa.lekka'), CARD)
  await writeFile(
    join(where, 'cards', 'erdkruste-aaaaaaaaaa.meta.json'),
    JSON.stringify({ key: 'a'.repeat(64), created: when, updated: when, touched: when }),
  )
  await writeFile(join(where, 'collections', 'purely-mellow-rhubarb-cypk.json'), '[{"id":"x"}]')
  await writeFile(
    join(where, 'collections', 'purely-mellow-rhubarb-cypk.meta.json'),
    JSON.stringify({ key: 'b'.repeat(64), created: when, updated: when, touched: when }),
  )

  const { db, store } = await open(where)
  assert.deepEqual(store.adopted, { cards: 1, collections: 1 })
  assert.equal(await store.cards.read('erdkruste-aaaaaaaaaa'), CARD)
  assert.equal(await store.collections.read('purely-mellow-rhubarb-cypk'), '[{"id":"x"}]')

  // The recipe file is still there and untouched; the envelope beside it is simply unread.
  assert.equal(await readFile(join(where, 'cards', 'erdkruste-aaaaaaaaaa.lekka'), 'utf8'), CARD)
  db.close()

  const again = await open(where)
  assert.deepEqual(again.store.adopted, { cards: 0, collections: 0 }, 'and only ever once')
  assert.equal(again.db.prepare('select count(*) as n from records').get().n, 2)
})

function age(db, id, days) {
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('update records set touched = ? where id = ?').run(when, id)
}

function touched(db, id) {
  return db.prepare('select touched from records where id = ?').get(id).touched
}
