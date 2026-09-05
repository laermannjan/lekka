import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { openDb } from '../server/db.js'
import { openPeople } from '../server/people.js'

async function file() {
  return join(await mkdtemp(join(tmpdir(), 'lekka-')), 'lekka.db')
}

/**
 * A data directory as an older build left it: the tables it knew about, and none of the
 * columns added since. Every test above this one starts from an empty directory, which
 * is exactly the case that cannot catch a missing column.
 */
function asItWas(path, { people = [] } = {}) {
  const db = new DatabaseSync(path)
  db.exec(`
    create table people (id text primary key, name text not null, created text not null);
    create table credentials (
      kind text not null, handle text not null, person text not null, secret text not null,
      primary key (kind, handle));
    create table sessions (
      id text primary key, token text not null unique, person text not null,
      label text not null, created text not null, seen text not null);
    create table cards (
      id text primary key, created text not null, updated text not null, touched text not null);
    create table grants (
      id text primary key, card text not null references cards(id) on delete cascade,
      kind text not null, subject text not null, scope text not null, issued_by text,
      created text not null, expires text, used text);
  `)
  for (const [at, name] of people.entries())
    db.prepare('insert into people (id, name, created) values (?, ?, ?)')
      .run(name.toLowerCase(), name, `2026-01-0${at + 1}T00:00:00.000Z`)
  db.close()
}

test('a database written before a column existed gains it on the next open', async () => {
  const path = await file()
  asItWas(path)

  const db = openDb(path)
  const held = db.prepare('pragma table_info(people)').all().map((one) => one.name)
  assert.ok(held.includes('admin'), 'the column is added rather than the open failing')

  // And the index that stands on it built, which is what actually broke.
  const indexes = db.prepare("select name from sqlite_master where type = 'index'").all()
  assert.ok(indexes.some((one) => one.name === 'people_operator'))
  db.close()
})

test('people who predate the operator get one: whoever arrived first', async () => {
  const path = await file()
  asItWas(path, { people: ['Jan', 'Rita'] })

  const db = openDb(path)
  const people = openPeople(db)
  assert.equal(people.operator().name, 'Jan', 'the rule that would have applied at the time')
  assert.equal(people.admin('rita'), false)
  db.close()

  // Opening it again changes nothing, and does not try to make a second one.
  const again = openDb(path)
  assert.equal(openPeople(again).operator().name, 'Jan')
  again.close()
})

test('an empty database is left without an operator until somebody arrives', async () => {
  const path = await file()
  const db = openDb(path)
  assert.equal(openPeople(db).operator(), null)
  db.close()
})

test('opening the same database twice is the same database', async () => {
  const path = await file()
  const first = openDb(path)
  const jan = openPeople(first).add('Jan', 'a long enough passphrase')
  first.close()

  const again = openDb(path)
  const people = openPeople(again)
  assert.equal(people.person(jan.id).name, 'Jan')
  assert.equal(people.operator().id, jan.id, 'and still the one who keeps it')
  again.close()
})
