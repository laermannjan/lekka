import { DatabaseSync } from 'node:sqlite'

/**
 * One database for everything that is not a recipe.
 *
 * A card stays a `.lekka` file, because "one recipe is one file you can grep, diff,
 * rsync and restore by hand" is the property this project is built on. Everything
 * around it - who owns what, which key opens it, when it was last read, what a
 * collection holds, who is signed in - is small, numerous, and read by more than one
 * column. That is the shape a directory is bad at and a table is good at, and keeping it
 * in files meant scanning a directory to answer "what is mine".
 *
 * `records` holds both kinds, because cards and collections differ only in where the
 * body lives: a card's is the file on disk, a collection's is the `body` column.
 */
const SCHEMA = `
create table if not exists records (
  kind    text not null,
  id      text not null,
  hash    text not null,
  owner   text,
  body    text,
  created text not null,
  updated text not null,
  touched text not null,
  primary key (kind, id)
);

create index if not exists records_owner on records (kind, owner);
create index if not exists records_touched on records (kind, touched);

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

create table if not exists settings (
  name  text primary key,
  value text not null
);
`

export function openDb(file) {
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = wal')
  db.exec('pragma foreign_keys = on')
  db.exec(SCHEMA)
  return db
}

/** A short run of work that either all happens or none of it does. */
export function inside(db, work) {
  db.exec('begin immediate')
  try {
    const answer = work()
    db.exec('commit')
    return answer
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}
