import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openDb } from '../server/db.js'
import { openGrants } from '../server/grants.js'
import { openPeople } from '../server/people.js'
import { openStore } from '../server/store.js'

const CARD = '# A\n\n- kochen\n  - Wasser: 1 l\n'

/**
 * Real people, because a grant's subject is one: the panel joins them to say who holds
 * what, and a row pointing at nobody is not a state the app can be in.
 */
async function open() {
  const where = await mkdtemp(join(tmpdir(), 'lekka-'))
  const db = openDb(join(where, 'lekka.db'))
  const grants = openGrants(db)
  const people = openPeople(db)
  const who = {}
  for (const name of ['Jan', 'Rita', 'Anna'])
    who[name.toLowerCase()] = people.add(name, 'a long enough passphrase').id
  return { grants, who, store: await openStore(where, db, grants).open() }
}

test('a scope carries the lesser ones, and nothing above it', async () => {
  const { grants, who, store } = await open()
  const { id } = await store.create(CARD, 'A', who.jan)
  grants.give(id, { person: who.rita, scope: 'edit' })
  grants.give(id, { person: who.anna, scope: 'read' })

  const may = (person, need) => grants.may(id, { person }, need)
  assert.deepEqual(
    ['owner', 'edit', 'read'].map((need) => may(who.jan, need)),
    [true, true, true],
  )
  assert.deepEqual(
    ['owner', 'edit', 'read'].map((need) => may(who.rita, need)),
    [false, true, true],
  )
  assert.deepEqual(
    ['owner', 'edit', 'read'].map((need) => may(who.anna, need)),
    [false, false, true],
  )
  assert.equal(may('nobodyatall', 'read'), false)
})

test('a grant expires, and an expired one is worth nothing', async () => {
  const { grants, who, store } = await open()
  const { id } = await store.create(CARD, 'A', who.jan)

  const gone = new Date(Date.now() - 60_000).toISOString()
  const soon = new Date(Date.now() + 60_000).toISOString()
  const stale = grants.give(id, { person: who.rita, scope: 'read', expires: gone })
  grants.give(id, { person: who.anna, scope: 'read', expires: soon })

  assert.equal(grants.may(id, { person: who.rita }, 'read'), false)
  assert.equal(grants.may(id, { person: who.anna }, 'read'), true)
  assert.deepEqual(grants.cards(who.rita), [], 'nor does it show in their library')
  assert.deepEqual(
    grants.cards(who.anna).map((row) => row.id),
    [id],
  )
  void stale
})

test('revoking one grant leaves the others standing', async () => {
  const { grants, who, store } = await open()
  const { id } = await store.create(CARD, 'A', who.jan)
  const one = grants.give(id, { person: who.rita, scope: 'read', by: who.jan })
  grants.give(id, { person: who.anna, scope: 'read', by: who.jan })

  assert.equal(grants.revoke(one.id), true)
  assert.equal(grants.revoke(one.id), false, 'revoking twice changes nothing')
  assert.equal(grants.may(id, { person: who.rita }, 'read'), false)
  assert.equal(grants.may(id, { person: who.anna }, 'read'), true, 'Anna still holds hers')
  assert.equal(grants.may(id, { person: who.jan }, 'owner'), true)
})

test('a recipe can only be handed to somebody, never to a string', async () => {
  const { grants, who, store } = await open()
  const { id } = await store.create(CARD, 'A', who.jan)
  assert.equal(grants.may(id, {}, 'read'), false, 'nobody is not somebody')
  assert.equal(grants.may(id, { person: null }, 'read'), false)
})

test('granting the same person twice changes what they hold', async () => {
  const { grants, who, store } = await open()
  const { id } = await store.create(CARD, 'A', who.jan)

  grants.give(id, { person: who.rita, scope: 'read' })
  grants.give(id, { person: who.rita, scope: 'edit' })

  assert.equal(grants.may(id, { person: who.rita }, 'edit'), true)
  assert.equal(grants.on(id).length, 2, 'one owner and one Rita, not one owner and two Ritas')
})

test('a library is what you hold, in the order it was last changed', async () => {
  const { grants, who, store } = await open()
  const mine = await store.create(CARD, 'Mine', who.jan)
  const theirs = await store.create(CARD, 'Theirs', who.rita)
  const shared = await store.create(CARD, 'Shared', who.rita)
  grants.give(shared.id, { person: who.jan, scope: 'read', by: who.rita })

  assert.deepEqual(
    grants.cards(who.jan).map((row) => row.id).sort(),
    [mine.id, shared.id].sort(),
    'what you own and what you were given, and nothing else',
  )
  assert.deepEqual(
    grants.cards(who.rita).map((row) => row.id).sort(),
    [theirs.id, shared.id].sort(),
  )
  assert.deepEqual(grants.cards(null), [])
})
