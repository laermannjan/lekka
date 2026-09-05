import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openDb } from '../server/db.js'
import { openGrants } from '../server/grants.js'
import { openStore } from '../server/store.js'

const CARD = '# A\n\n- kochen\n  - Wasser: 1 l\n'

async function open() {
  const where = await mkdtemp(join(tmpdir(), 'lekka-'))
  const db = openDb(join(where, 'lekka.db'))
  const grants = openGrants(db)
  return { grants, store: await openStore(where, db, grants).open() }
}

test('a scope carries the lesser ones, and nothing above it', async () => {
  const { grants, store } = await open()
  const { id } = await store.create(CARD, 'A', 'jan')
  grants.give(id, { person: 'rita', scope: 'edit' })
  grants.give(id, { person: 'anna', scope: 'read' })

  const may = (person, need) => grants.may(id, { person }, need)
  assert.deepEqual(
    ['owner', 'edit', 'read'].map((need) => may('jan', need)),
    [true, true, true],
  )
  assert.deepEqual(
    ['owner', 'edit', 'read'].map((need) => may('rita', need)),
    [false, true, true],
  )
  assert.deepEqual(
    ['owner', 'edit', 'read'].map((need) => may('anna', need)),
    [false, false, true],
  )
  assert.equal(may('nobody', 'read'), false)
})

test('a link grant is the token, and the token is never stored', async () => {
  const { grants, store } = await open()
  const { id } = await store.create(CARD, 'A', 'jan')

  const link = grants.give(id, { scope: 'read', by: 'jan' })
  assert.equal(link.kind, 'link')
  assert.equal(link.token.length, 22)

  assert.equal(grants.may(id, { token: link.token }, 'read'), true)
  assert.equal(grants.may(id, { token: link.token }, 'edit'), false)
  assert.equal(grants.may(id, { token: 'notthetokenatall' }, 'read'), false)
  assert.equal(grants.may(id, {}, 'read'), false)

  const listed = grants.on(id)
  assert.equal(listed.length, 2)
  for (const row of listed)
    assert.equal(Object.hasOwn(row, 'subject'), false, 'a panel never shows the token itself')
})

test('a grant expires, and an expired one is worth nothing', async () => {
  const { grants, store } = await open()
  const { id } = await store.create(CARD, 'A', 'jan')

  const gone = new Date(Date.now() - 60_000).toISOString()
  const soon = new Date(Date.now() + 60_000).toISOString()
  const stale = grants.give(id, { person: 'rita', scope: 'read', expires: gone })
  grants.give(id, { person: 'anna', scope: 'read', expires: soon })

  assert.equal(grants.may(id, { person: 'rita' }, 'read'), false)
  assert.equal(grants.may(id, { person: 'anna' }, 'read'), true)
  assert.deepEqual(grants.cards('rita'), [], 'nor does it show in their library')
  assert.deepEqual(
    grants.cards('anna').map((row) => row.id),
    [id],
  )
  void stale
})

test('revoking one grant leaves the others standing', async () => {
  const { grants, store } = await open()
  const { id } = await store.create(CARD, 'A', 'jan')
  const one = grants.give(id, { scope: 'read', by: 'jan' })
  const other = grants.give(id, { scope: 'read', by: 'jan' })

  assert.equal(grants.revoke(one.id), true)
  assert.equal(grants.revoke(one.id), false, 'revoking twice changes nothing')
  assert.equal(grants.may(id, { token: one.token }, 'read'), false)
  assert.equal(grants.may(id, { token: other.token }, 'read'), true, 'the other link still opens')
  assert.equal(grants.may(id, { person: 'jan' }, 'owner'), true)
})

test('granting the same person twice changes what they hold', async () => {
  const { grants, store } = await open()
  const { id } = await store.create(CARD, 'A', 'jan')

  grants.give(id, { person: 'rita', scope: 'read' })
  grants.give(id, { person: 'rita', scope: 'edit' })

  assert.equal(grants.may(id, { person: 'rita' }, 'edit'), true)
  assert.equal(grants.on(id).length, 2, 'one owner and one Rita, not one owner and two Ritas')
})

test('a library is what you hold, in the order it was last changed', async () => {
  const { grants, store } = await open()
  const mine = await store.create(CARD, 'Mine', 'jan')
  const theirs = await store.create(CARD, 'Theirs', 'rita')
  const shared = await store.create(CARD, 'Shared', 'rita')
  grants.give(shared.id, { person: 'jan', scope: 'read', by: 'rita' })

  assert.deepEqual(
    grants.cards('jan').map((row) => row.id).sort(),
    [mine.id, shared.id].sort(),
    'what you own and what you were given, and nothing else',
  )
  assert.deepEqual(
    grants.cards('rita').map((row) => row.id).sort(),
    [theirs.id, shared.id].sort(),
  )
  assert.deepEqual(grants.cards(null), [])
})
