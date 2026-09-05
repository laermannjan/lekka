import { DatabaseSync } from 'node:sqlite'

/**
 * One database for everything that is not a recipe.
 *
 * A card stays a `.lekka` file, because "one recipe is one file you can grep, diff,
 * rsync and restore by hand" is the property this project is built on. What surrounds a
 * card is small, numerous, and read by more than one column, which is the shape a
 * directory is bad at.
 *
 * A card is an id and three dates. Every question about who may touch it - ownership
 * included - is one lookup in `grants`, so there is one mechanism rather than a column
 * for the owner and a table for everybody else.
 */
const SCHEMA = `
create table if not exists cards (
  id      text primary key,
  created text not null,
  updated text not null,
  touched text not null
);

create table if not exists grants (
  id        text primary key,
  card      text not null references cards(id) on delete cascade,
  kind      text not null,
  subject   text not null,
  scope     text not null,
  issued_by text,
  created   text not null,
  expires   text,
  used      text
);

/* A card has one owner or none, never two. A subject is named once per card, so
 * granting again changes what they hold rather than stacking a second row. */
create unique index if not exists grants_owner on grants (card) where scope = 'owner';
create unique index if not exists grants_once on grants (card, kind, subject);
create index if not exists grants_subject on grants (kind, subject);

/* The first person to arrive keeps the instance: they are the one who can see everybody
 * and remove somebody. It is a flag rather than a role table, because there are two
 * kinds of person here and there is no third one coming. */
create table if not exists people (
  id      text primary key,
  name    text not null,
  admin   integer not null default 0,
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

/* How somebody new arrives, made by whoever is already inside. Single use and short
 * lived, so the table is small and mostly empty. */
create table if not exists invites (
  token   text primary key,
  person  text references people(id) on delete cascade,
  created text not null,
  expires text not null
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
