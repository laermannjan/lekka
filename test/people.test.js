import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openPeople } from '../server/people.js'

async function people() {
  return openPeople(join(await mkdtemp(join(tmpdir(), 'lekka-')), 'lekka.db'))
}

test('the first person turns an empty instance into one with an owner', async (t) => {
  const db = await people()
  t.after(() => db.close())

  assert.equal(db.empty(), true)
  const jan = db.add('Jan', 'a long enough passphrase')
  assert.equal(db.empty(), false)
  assert.equal(db.person(jan.id).name, 'Jan')
  assert.equal(db.person('nobodyxyz'), null)
})

test('a password is checked, and a wrong one answers like a name nobody has', async (t) => {
  const db = await people()
  t.after(() => db.close())

  const jan = db.add('Jan', 'correct horse battery')
  assert.equal(db.verify('Jan', 'correct horse battery').id, jan.id)
  assert.equal(db.verify('jan', 'correct horse battery').id, jan.id, 'the handle is case-blind')
  assert.equal(db.verify('Jan', 'wrong'), null)
  assert.equal(db.verify('Rita', 'correct horse battery'), null)
})

test('a handle is claimed once', async (t) => {
  const db = await people()
  t.after(() => db.close())

  db.add('Jan', 'one passphrase here')
  assert.throws(() => db.add('jan', 'another passphrase'))
})

test('a session names its person, and is revoked without holding its token', async (t) => {
  const db = await people()
  t.after(() => db.close())

  const jan = db.add('Jan', 'a long enough passphrase')
  const phone = db.mint(jan.id, "Jan's phone")
  const laptop = db.mint(jan.id, "Jan's laptop")

  const found = db.session(phone)
  assert.equal(found.person, jan.id)
  assert.equal(found.name, 'Jan')
  assert.equal(found.label, "Jan's phone")
  assert.equal(db.session('notatokenatall'), null)
  assert.equal(db.session(null), null)

  const open = db.sessions(jan.id)
  assert.equal(open.length, 2)
  assert.deepEqual(new Set(open.map((row) => row.label)), new Set(["Jan's phone", "Jan's laptop"]))

  assert.equal(db.revoke(jan.id, open[0].id), true)
  assert.equal(db.revoke(jan.id, open[0].id), false, 'revoking twice changes nothing')
  assert.equal(db.sessions(jan.id).length, 1)

  db.drop(laptop)
  assert.equal(db.session(laptop), null)
})

test('one person cannot revoke another person’s browser', async (t) => {
  const db = await people()
  t.after(() => db.close())

  const jan = db.add('Jan', 'a long enough passphrase')
  const rita = db.add('Rita', 'a different passphrase')
  db.mint(rita.id, "Rita's phone")

  const hers = db.sessions(rita.id)[0]
  assert.equal(db.revoke(jan.id, hers.id), false)
  assert.equal(db.sessions(rita.id).length, 1)
})

test('a token survives reopening the file', async (t) => {
  const file = join(await mkdtemp(join(tmpdir(), 'lekka-')), 'lekka.db')
  const first = openPeople(file)
  const jan = first.add('Jan', 'a long enough passphrase')
  const token = first.mint(jan.id, 'a browser')
  first.close()

  const again = openPeople(file)
  t.after(() => again.close())
  assert.equal(again.session(token).person, jan.id)
})
