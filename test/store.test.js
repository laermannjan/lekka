import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openDb } from '../server/db.js'
import { openGrants } from '../server/grants.js'
import { openStore } from '../server/store.js'

const CARD = '# A\n\n- kochen\n  - Wasser: 1 l\n'

async function directory() {
  return mkdtemp(join(tmpdir(), 'lekka-'))
}

/** The store, and what is underneath it, since some tests ask the rows directly. */
async function open(where) {
  const db = openDb(join(where, 'lekka.db'))
  const grants = openGrants(db)
  return { db, grants, store: await openStore(where, db, grants).open() }
}

async function store() {
  return (await open(await directory())).store
}

test('a card round-trips through its file', async () => {
  const cards = await store()
  const { id } = await cards.create(CARD, 'Dinkelquarkbrot')

  assert.match(id, /^dinkelquarkbrot-[a-z0-9]{10}$/)
  assert.equal(await cards.read(id), CARD)
  assert.equal(await cards.read('nothingxyz'), null)

  assert.equal(await cards.write(id, '# B\n'), true)
  assert.equal(await cards.read(id), '# B\n')
  assert.equal(await cards.write('nothingxyz', '# B\n'), false)
})

test('only the recipes are files; everything else is a row', async () => {
  const where = await directory()
  const { db, store } = await open(where)
  const card = await store.create(CARD, 'Dinkelquarkbrot', 'person-one')

  assert.deepEqual((await readdir(where)).filter((name) => !name.startsWith('lekka.db')), ['cards'])
  assert.deepEqual(await readdir(join(where, 'cards')), [`${card.id}.lekka`])
  assert.equal(await readFile(join(where, 'cards', `${card.id}.lekka`), 'utf8'), CARD)

  const row = db.prepare('select * from cards').get()
  assert.deepEqual(Object.keys(row).sort(), ['created', 'id', 'touched', 'updated'])
})

test('a card made by somebody is owned by them, and by nobody twice', async () => {
  const { db, grants, store } = await open(await directory())
  const { id } = await store.create(CARD, 'A', 'person-one')

  assert.equal(grants.may(id, { person: 'person-one' }, 'owner'), true)
  assert.equal(grants.may(id, { person: 'person-one' }, 'edit'), true, 'owning carries editing')
  assert.equal(grants.may(id, { person: 'person-two' }, 'read'), false)

  assert.throws(
    () => grants.give(id, { person: 'person-two', scope: 'owner' }),
    'a card has one owner or none, never two',
  )
  assert.equal(db.prepare("select count(*) as n from grants where scope = 'owner'").get().n, 1)
})

test('a card made where nobody is signed in is owned by nobody', async () => {
  const { db, store } = await open(await directory())
  await store.create(CARD, 'A')
  assert.equal(db.prepare('select count(*) as n from grants').get().n, 0)
})

test('a title becomes a file name, and nothing else can', async () => {
  const cards = await store()
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

  assert.equal(await store.read('erdkruste'), null, 'a file nothing points at is not a card')
  assert.equal(store.has('erdkruste'), false)
})

test('the library is every card, most recently changed first', async () => {
  const cards = await store()
  const first = await cards.create(CARD, 'One')
  await new Promise((done) => setTimeout(done, 5))
  const second = await cards.create(CARD, 'Two')

  assert.deepEqual(
    cards.all().map((row) => row.id),
    [second.id, first.id],
  )
})

test('removing takes the file, the row, and every grant on it', async () => {
  const { db, store } = await open(await directory())
  const { id } = await store.create(CARD, 'A', 'person-one')

  await store.remove(id)
  assert.equal(await store.read(id), null)
  assert.equal(db.prepare('select count(*) as n from cards').get().n, 0)
  assert.equal(db.prepare('select count(*) as n from grants').get().n, 0, 'cascaded')
})

test('a sweep drops what nobody has touched', async () => {
  const where = await directory()
  const { db, store } = await open(where)
  const stale = await store.create(CARD)
  const fresh = await store.create(CARD)

  age(db, stale.id, 400)
  await store.sweep(365)

  assert.equal(await store.read(stale.id), null)
  assert.notEqual(await store.read(fresh.id), null)
})

test('a sweep reaps what an interrupted write left behind', async () => {
  const where = await directory()
  const { store } = await open(where)
  const { id } = await store.create(CARD)

  const orphan = join(where, 'cards', 'orphan-cccccccccc.lekka')
  const temporary = join(where, 'cards', `${id}.lekka.abc123`)
  const young = join(where, 'cards', 'young-dddddddddd.lekka')
  for (const path of [orphan, temporary, young]) await writeFile(path, CARD)
  const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)
  for (const path of [orphan, temporary]) await utimes(path, old, old)

  await store.sweep(365)

  assert.deepEqual(
    (await readdir(join(where, 'cards'))).sort(),
    [`${id}.lekka`, 'young-dddddddddd.lekka'].sort(),
  )
})

test('a read keeps a card alive, but writes at most daily', async () => {
  const where = await directory()
  const { db, store } = await open(where)
  const { id } = await store.create(CARD)

  const before = touched(db, id)
  await store.touch(id)
  assert.equal(touched(db, id), before)

  age(db, id, 2)
  const stale = touched(db, id)
  await store.touch(id)
  assert.notEqual(touched(db, id), stale)
})

function age(db, id, days) {
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('update cards set touched = ? where id = ?').run(when, id)
}

function touched(db, id) {
  return db.prepare('select touched from cards where id = ?').get(id).touched
}
