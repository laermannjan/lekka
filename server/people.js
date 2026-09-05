import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import { newId } from '../app/id.js'

const TOKEN_LENGTH = 22
const HOUR = 60 * 60 * 1000

/* One row per way in. A password keeps its digest here; an OIDC subject will be another
 * kind with an empty secret, so growing a second provider never changes the lookup. */
const SCHEMA = `
create table if not exists people (
  id      text primary key,
  name    text not null,
  created text not null
);

create table if not exists credentials (
  kind   text not null,
  handle text not null,
  person text not null references people(id) on delete cascade,
  secret text not null,
  primary key (kind, handle)
);

create table if not exists sessions (
  id      text primary key,
  token   text not null unique,
  person  text not null references people(id) on delete cascade,
  label   text not null,
  created text not null,
  seen    text not null
);

create index if not exists sessions_person on sessions (person);
`

/**
 * People, the ways they sign in, and the browsers they are signed in on. Rows rather
 * than files: these are small, numerous, and read by more than one column, which is the
 * one shape a directory is bad at. Cards stay on disk, where they can still be grepped,
 * diffed and rsynced.
 */
export function openPeople(file) {
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = wal')
  db.exec('pragma foreign_keys = on')
  db.exec(SCHEMA)

  const one = (sql) => db.prepare(sql)
  const find = one('select id, name, created from people where id = ?')
  const byHandle = one('select person, secret from credentials where kind = ? and handle = ?')
  const addPerson = one('insert into people (id, name, created) values (?, ?, ?)')
  const addCredential = one(
    'insert into credentials (kind, handle, person, secret) values (?, ?, ?, ?)',
  )
  const addSession = one(
    'insert into sessions (id, token, person, label, created, seen) values (?, ?, ?, ?, ?, ?)',
  )
  const bySession = one(
    `select s.id, s.person, s.label, s.created, s.seen, p.name
       from sessions s join people p on p.id = s.person
      where s.token = ?`,
  )
  const seen = one('update sessions set seen = ? where token = ?')
  const counted = one('select count(*) as n from people')
  const open = one(
    'select id, label, created, seen from sessions where person = ? order by seen desc',
  )
  const drop = one('delete from sessions where person = ? and id = ?')
  const dropToken = one('delete from sessions where token = ?')

  return {
    /** Nobody has signed up yet, which is what the operator's bootstrap link is for. */
    empty() {
      return counted.get().n === 0
    },

    person(id) {
      return find.get(id) ?? null
    },

    /**
     * A name is a display name and may repeat; the handle it signs in under may not,
     * which the credentials key already enforces.
     */
    add(name, password) {
      const id = newId()
      const now = new Date().toISOString()
      db.exec('begin immediate')
      try {
        addPerson.run(id, name, now)
        addCredential.run('password', handle(name), id, digest(password))
        db.exec('commit')
      } catch (error) {
        db.exec('rollback')
        throw error
      }
      return { id, name, created: now }
    },

    /** Null for a wrong password and null for a name nobody has, told apart nowhere. */
    verify(name, password) {
      const found = byHandle.get('password', handle(name))
      if (!found) {
        digest(password) // spend the same time, so a name cannot be probed for
        return null
      }
      return matches(found.secret, password) ? this.person(found.person) : null
    },

    /** The cookie's value is returned once and never stored; only its hash is kept. */
    mint(person, label) {
      const token = newId(TOKEN_LENGTH)
      const now = new Date().toISOString()
      addSession.run(newId(), hash(token), person, label ?? 'a browser', now, now)
      return token
    },

    /** Last-seen is worth a write an hour, not a write a request. */
    session(token) {
      if (!token) return null
      const key = hash(token)
      const found = bySession.get(key)
      if (!found) return null
      const now = new Date()
      if (now - new Date(found.seen) > HOUR) seen.run(now.toISOString(), key)
      return found
    },

    sessions(person) {
      return open.all(person)
    },

    revoke(person, id) {
      return drop.run(person, id).changes > 0
    },

    /** Signing out drops the one browser asking, by the token it presented. */
    drop(token) {
      if (token) dropToken.run(hash(token))
    },

    close() {
      db.close()
    },
  }
}

const handle = (name) => (name ?? '').trim().toLowerCase()

const hash = (token) => createHash('sha256').update(token).digest('hex')

function digest(password) {
  const salt = randomBytes(16)
  return `${salt.toString('hex')}:${scryptSync(password ?? '', salt, 32).toString('hex')}`
}

function matches(stored, password) {
  const [salt, kept] = String(stored).split(':')
  if (!salt || !kept) return false
  const made = scryptSync(password ?? '', Buffer.from(salt, 'hex'), 32)
  const held = Buffer.from(kept, 'hex')
  return made.length === held.length && timingSafeEqual(made, held)
}
